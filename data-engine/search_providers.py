import json
import os
import re
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, TypedDict

from bs4 import BeautifulSoup, Tag


class SearchResult(TypedDict):
    url: str
    title: str
    snippet: str


class SearchProvider(ABC):
    """Provider interface for returning a list of web result dictionaries."""

    @abstractmethod
    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        raise NotImplementedError


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def is_safe_url(url: str) -> bool:
    """
    Ensures URL uses safe HTTP or HTTPS scheme and has a valid domain.
    Rejects javascript:, data:, file:, etc.
    """
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def sanitize_text(value: str, max_length: int = 200) -> str:
    """Minimal sanitizer shared by the search providers module."""
    if not value or not isinstance(value, str):
        return ""
    cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned


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
        try:
            safe_query = sanitize_text(query, max_length=200)
            query_param = urllib.parse.quote_plus(safe_query)
            url = f"https://html.duckduckgo.com/html/?q={query_param}"
            req = urllib.request.Request(url, headers=HEADERS)
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
        except Exception as error:
            print(f"[DuckDuckGoProvider Warning] Live scrape encountered error: {error}")
        return results[:depth]


class BingProvider(SearchProvider):
    """Bing HTML provider placeholder. Can be swapped in when the app has provider credentials."""

    def search(self, query: str, depth: int = 5) -> List[SearchResult]:
        results: List[SearchResult] = []
        try:
            safe_query = sanitize_text(query, max_length=200)
            quoted = urllib.parse.quote_plus(safe_query)
            url = f"https://www.bing.com/search?q={quoted}"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                soup = BeautifulSoup(html, "html.parser")
                for card in soup.select("li.b_algo"):
                    link = card.find("a")
                    snippet = card.find("div", class_="b_caption") or card.find("p")
                    if not link:
                        continue
                    url_value = link.get("href")
                    if not is_safe_url(url_value):
                        continue
                    results.append({
                        "url": url_value,
                        "title": sanitize_text(link.get_text(" ", strip=True), max_length=300),
                        "snippet": sanitize_text(snippet.get_text(" ", strip=True) if snippet else "", max_length=1500),
                    })
                    if len(results) >= depth:
                        break
        except Exception as error:
            print(f"[BingProvider Warning] Live scrape encountered error: {error}")
        return results[:depth]


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
                return [
                    {
                        "url": item.get("link", ""),
                        "title": sanitize_text(item.get("title", ""), max_length=300),
                        "snippet": sanitize_text(item.get("snippet", ""), max_length=1500),
                    }
                    for item in organic
                    if is_safe_url(item.get("link", ""))
                ]
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
                    results.append({
                        "url": url,
                        "title": sanitize_text(item.get("title", ""), max_length=300),
                        "snippet": sanitize_text(item.get("content", "") or item.get("snippet", ""), max_length=1500),
                    })
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


def _configured_provider_name(name: Optional[str] = None) -> str:
    """Resolve the configured provider from environment before falling back to a safe default."""
    requested = (name or os.getenv("SEARCH_PROVIDER") or "serper").lower()
    if requested == "serper" and not os.getenv("SERPER_API_KEY"):
        return "tavily" if os.getenv("TAVILY_API_KEY") else "duckduckgo"
    if requested == "tavily" and not os.getenv("TAVILY_API_KEY"):
        return "serper" if os.getenv("SERPER_API_KEY") else "duckduckgo"
    return requested


def get_provider(name: Optional[str] = None) -> SearchProvider:
    """Factory returning a provider instance based on request or environment configuration."""
    requested = _configured_provider_name(name)
    providers = {
        "duckduckgo": DuckDuckGoProvider,
        "bing": BingProvider,
        "serper": SerperProvider,
        "tavily": TavilyProvider,
        "mock": MockSearchProvider,
    }
    provider_class = providers.get(requested)
    if not provider_class:
        return DuckDuckGoProvider()
    return provider_class()
