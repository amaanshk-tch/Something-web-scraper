import json
import os
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, TypedDict

from bs4 import BeautifulSoup, Tag

from utils import HEADERS, coerce_iso_datetime, is_safe_url, sanitize_text


class SearchResult(TypedDict):
    url: str
    title: str
    snippet: str


class SearchProvider(ABC):
    """Provider interface for returning a list of web result dictionaries."""

    @abstractmethod
    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        raise NotImplementedError


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
            candidate_href = candidate.get("href", "")
            decoded = decode_duckduckgo_href(candidate_href)
            if is_safe_url(decoded):
                href = decoded
                break

    if not href:
        return None

    raw_title = title_elem.get_text(" ", strip=True) if title_elem else ""
    raw_snippet = snippet_elem.get_text(" ", strip=True) if snippet_elem else ""

    if not raw_title and not raw_snippet:
        return None

    parsed_url = urllib.parse.urlparse(href)
    fallback_title = parsed_url.netloc or href

    clean_title = sanitize_text(raw_title or fallback_title, max_length=300)
    clean_snip = sanitize_text(raw_snippet or clean_title, max_length=1500)

    return {
        "url": href,
        "title": clean_title,
        "snippet": clean_snip,
    }


class DuckDuckGoProvider(SearchProvider):
    """DuckDuckGo HTML provider. Owns the HTML site search and CSS-class parser."""

    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        results: List[SearchResult] = []
        safe_query = sanitize_text(query, max_length=200)
        query_param = urllib.parse.quote_plus(safe_query)
        url = f"https://html.duckduckgo.com/html/?q={query_param}"
        req = urllib.request.Request(url, headers=HEADERS)
        # Failures must propagate: a silent empty result here is indistinguishable
        # from a genuine "no results" search, and would hide a broken search path.
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            soup = BeautifulSoup(html, "html.parser")
            cards = soup.find_all("div", class_="result")
            for card in cards:
                if len(results) >= depth:
                    break
                parsed = extract_result_from_card(card)
                if parsed:
                    results.append({
                        "url": parsed["url"],
                        "title": parsed["title"],
                        "snippet": parsed["snippet"],
                    })
        return results[:depth]


def _serper_result(item: Dict[str, Any]) -> Optional[Dict[str, str]]:
    url = item.get("link", "")
    if not is_safe_url(url):
        return None
    result = {
        "url": url,
        "title": sanitize_text(item.get("title", ""), max_length=300),
        "snippet": sanitize_text(item.get("snippet", ""), max_length=1500),
    }
    published_at = coerce_iso_datetime(item.get("date"))
    if published_at:
        result["publishedAt"] = published_at
    return result


class SerperProvider(SearchProvider):
    """Serper Google Search provider. Uses API when SERPER_API_KEY is available; falls back to DDG HTML if absent."""

    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        api_key = os.getenv("SERPER_API_KEY", "")
        if not api_key:
            return DuckDuckGoProvider().search(query, depth)

        try:
            payload = json.dumps({"q": query, "num": depth}).encode("utf-8")
            req = urllib.request.Request(
                "https://google.serper.dev/search",
                data=payload,
                headers={
                    **HEADERS,
                    "X-API-KEY": api_key,
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                organic = data.get("organic", [])[:depth]
                results = []
                for item in organic:
                    extracted = _serper_result(item)
                    if extracted:
                        results.append(extracted)
                return results
        except Exception as error:
            print(f"[SerperProvider Warning] API search encountered error: {error}")
            return DuckDuckGoProvider().search(query, depth)


class TavilyProvider(SearchProvider):
    """Tavily provider. Uses API when TAVILY_API_KEY is available; falls back to DDG HTML if absent."""

    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return DuckDuckGoProvider().search(query, depth)

        try:
            payload = json.dumps({
                "query": query,
                "max_results": depth,
                "search_depth": "basic",
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.tavily.com/search",
                data=payload,
                headers={
                    **HEADERS,
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                results = []
                for item in data.get("results", [])[:depth]:
                    url = item.get("url", "")
                    if not is_safe_url(url):
                        continue
                    result = {
                        "url": url,
                        "title": sanitize_text(item.get("title", ""), max_length=300),
                        "snippet": sanitize_text(item.get("content", "") or item.get("snippet", ""), max_length=1500),
                    }
                    published_at = coerce_iso_datetime(item.get("published_date"))
                    if published_at:
                        result["publishedAt"] = published_at
                    score = item.get("score")
                    if isinstance(score, (int, float)):
                        result["relevanceScore"] = float(score)
                    results.append(result)
                return results
        except Exception as error:
            print(f"[TavilyProvider Warning] API search encountered error: {error}")
            return DuckDuckGoProvider().search(query, depth)


class MockSearchProvider(SearchProvider):
    """Mock provider used for local demos and regression testing."""

    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        topic = sanitize_text(query, max_length=80)
        return [
            {
                "url": "https://example.com/alpha",
                "title": f"{topic} headline",
                "snippet": "Sample retrieved signal from the mock provider.",
            },
            {
                "url": "https://example.com/beta",
                "title": f"{topic} follow-up",
                "snippet": "Another sample source snippet for the mock provider.",
            },
        ][:depth]


# Providers that can be selected by name. 'mock' is excluded and must be
# enabled explicitly via ALLOW_MOCK_PROVIDER for local demos and tests.
ALLOWED_REQUEST_PROVIDERS = ("serper", "tavily", "duckduckgo")


def mock_provider_allowed() -> bool:
    return os.getenv("ALLOW_MOCK_PROVIDER", "").strip().lower() in ("1", "true", "yes", "on")


def _configured_provider_name(name: Optional[str] = None) -> str:
    """Resolve the configured provider from environment before falling back to a safe default."""
    requested = (name or os.getenv("SEARCH_PROVIDER") or "serper").lower()
    if requested == "serper" and not os.getenv("SERPER_API_KEY"):
        return "tavily" if os.getenv("TAVILY_API_KEY") else "duckduckgo"
    if requested == "tavily" and not os.getenv("TAVILY_API_KEY"):
        return "serper" if os.getenv("SERPER_API_KEY") else "duckduckgo"
    return requested


def get_provider(name: Optional[str] = None) -> SearchProvider:
    """
    Factory returning a registered provider.
    Unknown names raise instead of silently degrading, so callers can never
    accidentally run an unvalidated or orphaned provider implementation.
    """
    requested = _configured_provider_name(name)
    if requested == "mock" and not mock_provider_allowed():
        raise ValueError("Mock provider is disabled unless ALLOW_MOCK_PROVIDER is enabled")
    providers = {
        "serper": SerperProvider,
        "tavily": TavilyProvider,
        "duckduckgo": DuckDuckGoProvider,
        "mock": MockSearchProvider,
    }
    provider_class = providers.get(requested)
    if provider_class is None:
        raise ValueError(f"Unsupported search provider: {requested}")
    return provider_class()
