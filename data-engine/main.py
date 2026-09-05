import os
import re
import json
import time
import uuid
from pathlib import Path
from typing import List, Dict, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from bs4 import BeautifulSoup, Tag
import urllib.parse
import urllib.request
from sentiment import analyze_sentiment_and_metrics, clean_snippet

if os.getenv("APP_ENV", "development") != "production":
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="Web Analytics - Data Extraction Engine", version="1.0.0")


def log_event(event: str, **fields: object) -> None:
    print(json.dumps({"service": "data-engine", "event": event, **fields}), flush=True)


INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")
if not INTERNAL_SERVICE_KEY:
    raise RuntimeError("INTERNAL_SERVICE_KEY environment variable is required.")
def verify_internal_key(x_internal_key: str = Header(None, alias="X-Internal-Key")):
    if not x_internal_key or x_internal_key != INTERNAL_SERVICE_KEY:
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


class ScrapeRequest(BaseModel):
    topic: str = Field(..., description="Target search topic or domain")
    keywords: List[str] = Field(default_factory=list, description="Specific keyword filters to count in result titles and snippets")
    depth: int = Field(default=5, description="Number of results to extract and process")

class ScrapedResultItem(BaseModel):
    sourceUrl: str
    title: str
    snippet: str
    sentiment: str
    mentions: int

class ScrapeResponse(BaseModel):
    topic: str
    totalExtracted: int
    liveResultsOnly: bool
    sentimentMetrics: Dict[str, int]
    bullets: List[str]
    results: List[ScrapedResultItem]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

def decode_duckduckgo_href(href: str) -> str:
    if "uddg=" in href:
        parsed = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
        if "uddg" in parsed and parsed["uddg"]:
            return parsed["uddg"][0]
    return href

def extract_result_from_card(card: Tag) -> Optional[Dict[str, str]]:
    title_elem = card.find("a", class_="result__a")
    snippet_elem = card.find(class_="result__snippet")
    url_elem = card.find("a", class_="result__url")

    href = ""
    for candidate in (title_elem, url_elem):
        if candidate and candidate.get("href"):
            href = decode_duckduckgo_href(candidate.get("href", ""))
            if href:
                break

    title_text = title_elem.get_text(" ", strip=True) if title_elem else ""
    snippet_text = snippet_elem.get_text(" ", strip=True) if snippet_elem else ""

    if not href or not (title_text or snippet_text):
        return None

    parsed_url = urllib.parse.urlparse(href)
    fallback_title = parsed_url.netloc or href

    return {
        "url": href,
        "title": title_text or fallback_title,
        "snippet": snippet_text or title_text,
    }

def search_web_sources(topic: str, depth: int = 5) -> List[Dict[str, str]]:
    """
    Fetches real search result cards from DuckDuckGo HTML endpoint.
    Returns only genuine extracted results - no synthetic backfill.
    If fewer results are available than requested, returns what was found.
    """
    results: List[Dict[str, str]] = []

    try:
        query_param = urllib.parse.quote_plus(topic)
        url = f"https://html.duckduckgo.com/html/?q={query_param}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, "html.parser")

            cards = soup.find_all("div", class_="result")
            for card in cards:
                if len(results) >= depth:
                    break

                parsed_card = extract_result_from_card(card)
                if parsed_card:
                    results.append(parsed_card)
    except Exception as error:
        print(f"[Search Engine Warning] Live scrape encountered error: {error}")

    return results[:depth]


@app.get("/health")
def health():
    return {"status": "ok", "service": "data-engine", "version": "1.0.0"}


@app.post("/scrape", response_model=ScrapeResponse, dependencies=[Depends(verify_internal_key)])
async def scrape_and_analyze(payload: ScrapeRequest):
    topic = payload.topic.strip()
    keywords = [k.lower().strip() for k in payload.keywords if k.strip()]
    depth = max(1, min(payload.depth, 15))

    sources = search_web_sources(topic, depth=depth)
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

        extracted_items.append(ScrapedResultItem(
            sourceUrl=url,
            title=title,
            snippet=snippet,
            sentiment=sentiment,
            mentions=mentions
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
            f"Lexical sentiment heuristic: {metrics['Positive']} positive, "
            f"{metrics['Negative']} negative, {metrics['Neutral']} neutral result{'s' if total != 1 else ''}."
        ),
        f"Keyword hits across titles and snippets: {keyword_hits} occurrence{'s' if keyword_hits != 1 else ''} of target term{'s' if len(keywords) != 1 else ''}.",
        (
            "Note: sentiment is estimated by keyword counting and does not account for negation or context. "
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
