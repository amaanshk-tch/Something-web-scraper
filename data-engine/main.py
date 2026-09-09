import os
import re
import json
import time
import uuid
from typing import List, Dict, Optional
from fastapi import FastAPI, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import hmac
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sentiment import analyze_sentiment_and_metrics, clean_snippet


def get_limiter_key(request: Request) -> str:
    """
    Prefer a caller header that scopes the limit to the authenticated user,
    and fall back to the request ID if the backend is the only source of truth
    for this internal request. Remote IP is used last to avoid the one-bucket
    problem observed when internal services sit behind a single local proxy.
    """
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return f"user:{user_id}"

    request_id = request.headers.get("X-Request-Id")
    if request_id:
        return f"request:{request_id}"

    return f"ip:{get_remote_address(request)}"
from search_providers import (
    ALLOWED_REQUEST_PROVIDERS,
    get_provider,
    mock_provider_allowed,
)
from utils import (
    classify_source_type,
    content_fingerprint,
    count_words,
    detect_non_latin_language,
    extract_domain,
    sanitize_text,
)

# ---------------------------------------------------------------------------
# Rate limiting — local in-memory, keyed by an internal request header signal
# when available. This prevents every caller from collapsing into the same
# shared 127.0.0.1 bucket while still preserving a safe IP fallback.
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_limiter_key, default_limits=["60/minute"])

app = FastAPI(title="Web Analytics - Data Extraction Engine", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def log_event(event: str, **fields: object) -> None:
    print(json.dumps({"service": "data-engine", "event": event, **fields}), flush=True)


INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")
if not INTERNAL_SERVICE_KEY:
    raise RuntimeError("INTERNAL_SERVICE_KEY environment variable is required.")


def verify_internal_key(x_internal_key: str = Header(None, alias="X-Internal-Key")):
    if not x_internal_key or not hmac.compare_digest(x_internal_key, INTERNAL_SERVICE_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal service authorization key"
        )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000)
    response.headers["X-Request-Id"] = request_id
    log_event("http.request.completed", requestId=request_id, method=request.method, path=request.url.path, status=response.status_code, durationMs=duration_ms)
    return response


# ---------------------------------------------------------------------------
# Input Sanitization Helpers
# ---------------------------------------------------------------------------

def sanitize_keywords(keywords: List[str], max_count: int = 20, max_kw_len: int = 50) -> List[str]:
    """
    Sanitizes, lowercases, deduplicates, and limits keyword list items.
    """
    cleaned_keywords: List[str] = []
    seen = set()
    for kw in keywords:
        if not isinstance(kw, str):
            continue
        cleaned = sanitize_text(kw, max_length=max_kw_len).lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            cleaned_keywords.append(cleaned)
            if len(cleaned_keywords) >= max_count:
                break
    return cleaned_keywords


class ScrapeRequest(BaseModel):
    topic: str = Field(..., description="Target search topic or domain")
    keywords: List[str] = Field(default_factory=list, description="Specific keyword filters to count in result titles and snippets")
    depth: int = Field(default=5, description="Number of results to extract and process")
    provider: str = Field(default=os.getenv("SEARCH_PROVIDER", "serper"), description="Search provider to use: serper, tavily, or duckduckgo")


class ScrapedResultItem(BaseModel):
    sourceUrl: str
    canonicalUrl: Optional[str] = None
    title: str
    snippet: str
    sentiment: str
    mentions: int
    domain: Optional[str] = None
    sourceType: Optional[str] = None
    publishedAt: Optional[str] = None
    contentHash: Optional[str] = None
    wordCount: Optional[int] = None
    language: Optional[str] = None
    relevanceScore: Optional[float] = None
    duplicateGroup: Optional[str] = None


class ScrapeResponse(BaseModel):
    topic: str
    totalExtracted: int
    liveResultsOnly: bool
    sentimentMetrics: Dict[str, int]
    bullets: List[str]
    results: List[ScrapedResultItem]


# Provider abstraction is defined in search_providers.py.
# The application now consults a provider factory and reads the default provider from the environment.
# Shared HTTP request headers are defined in utils.py.


def search_web_sources(topic: str, depth: int = 5, provider_name: str = os.getenv("SEARCH_PROVIDER", "serper")) -> List[Dict[str, str]]:
    """
    Fetches real search result records through a SearchProvider implementation.
    The default is environment-configurable and can be selected as serper/tavily/duckduckgo.
    """
    provider = get_provider(provider_name)
    raw_results = provider.search(topic, depth)
    sources = []
    for result in raw_results:
        url = result.get("url", "")
        title = result.get("title", "")
        if not url or not title:
            continue
        entry = {
            "url": url,
            "title": title,
            "snippet": result.get("snippet", ""),
        }
        if result.get("publishedAt"):
            entry["publishedAt"] = result["publishedAt"]
        if isinstance(result.get("relevanceScore"), (int, float)):
            entry["relevanceScore"] = result["relevanceScore"]
        sources.append(entry)
    return sources


@app.get("/health")
@limiter.limit("60/minute")
def health(request: Request):
    try:
        get_provider()
    except Exception as error:
        log_event("health.check_failed", error=str(error))
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "service": "data-engine", "version": "1.0.0", "searchProvider": "unavailable"},
        )
    return {"status": "ok", "service": "data-engine", "version": "1.0.0", "searchProvider": "ok"}


@app.post("/scrape", response_model=ScrapeResponse, dependencies=[Depends(verify_internal_key)])
@limiter.limit("30/minute")  # Scraping is expensive — tight cap even for internal callers
def scrape_and_analyze(payload: ScrapeRequest, request: Request):
    # Sanitize inputs
    topic = sanitize_text(payload.topic, max_length=200)
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Topic is required and cannot be empty after sanitization."
        )

    keywords = sanitize_keywords(payload.keywords, max_count=20, max_kw_len=50)
    depth = max(1, min(int(payload.depth), 15))
    provider_name = sanitize_text(payload.provider, max_length=50).lower() or os.getenv("SEARCH_PROVIDER", "serper")

    # Internal services must not be able to select arbitrary provider names
    # (bing, mock, or anything misspelled) — validate against the allowlist.
    if provider_name not in ALLOWED_REQUEST_PROVIDERS and not (provider_name == "mock" and mock_provider_allowed()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported search provider: {provider_name}",
        )

    try:
        sources = search_web_sources(topic, depth=depth, provider_name=provider_name)
    except Exception as error:
        # A search failure (e.g. every provider unavailable) is NOT the same as
        # a successful search with zero results. Surface it as a 502 so callers
        # can mark the job FAILED instead of reporting an empty COMPLETED run.
        log_event("search.failed", provider=provider_name, error=str(error))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Search provider unavailable. Please retry later.",
        )
    live_results_only = len(sources) < depth

    extracted_items = []
    positive_count = 0
    negative_count = 0
    neutral_count = 0

    for item in sources:
        snippet = clean_snippet(item["snippet"])
        title = item["title"]
        url = item["url"]

        combined_text = f"{title} {snippet}".lower()
        mentions = (
            sum(len(re.findall(r'\b' + re.escape(keyword) + r'\b', combined_text)) for keyword in keywords)
            if keywords else 1
        )

        sentiment, _ = analyze_sentiment_and_metrics(combined_text)
        if sentiment == "positive":
            positive_count += 1
        elif sentiment == "negative":
            negative_count += 1
        else:
            neutral_count += 1

        domain = extract_domain(url)
        source_type = classify_source_type(url)
        word_count = count_words(f"{title} {snippet}")
        language = detect_non_latin_language(f"{title} {snippet}")

        extracted_items.append(ScrapedResultItem(
            sourceUrl=url,
            canonicalUrl=url,
            title=title,
            snippet=snippet,
            sentiment=sentiment,
            mentions=mentions,
            domain=domain or None,
            sourceType=source_type,
            publishedAt=item.get("publishedAt"),
            contentHash=content_fingerprint(url, title, snippet),
            wordCount=word_count,
            language=language,
            relevanceScore=item.get("relevanceScore"),
            duplicateGroup=content_fingerprint(title, snippet),
        ))

    metrics = {
        "Positive": positive_count,
        "Negative": negative_count,
        "Neutral": neutral_count,
    }

    total = len(extracted_items)
    keyword_hits = sum(item.mentions for item in extracted_items)

    bullets = [
        f"Retrieved {total} search-result snippet{'s' if total != 1 else ''} for '{topic}'.",
        (
            f"Lexical signal heuristic: {metrics['Positive']} positive, "
            f"{metrics['Negative']} negative, {metrics['Neutral']} neutral result{'s' if total != 1 else ''}."
        ),
        f"Keyword hits across titles and snippets: {keyword_hits} occurrence{'s' if keyword_hits != 1 else ''} of target term{'s' if len(keywords) != 1 else ''}.",
        (
            "Note: lexical signal is estimated by keyword counting and does not account for negation or context. "
            "Results are search-result snippets, not full source documents."
        ),
    ]

    return ScrapeResponse(
        topic=topic,
        totalExtracted=total,
        liveResultsOnly=live_results_only,
        sentimentMetrics=metrics,
        bullets=bullets,
        results=extracted_items
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
