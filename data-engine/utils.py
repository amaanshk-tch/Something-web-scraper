import hashlib
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Optional


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
        return parsed.scheme in ("http", "https") and bool(parsed.hostname)
    except Exception:
        return False


def sanitize_text(value: str, max_length: int = 200) -> str:
    """
    Sanitizes string inputs:
    - Strips non-printable and control characters (ASCII 0-31, 127-159)
    - Strips HTML / XML tags to prevent script injection
    - Normalizes multiple spaces/newlines/tabs into a single space
    - Truncates to max_length
    """
    if not value or not isinstance(value, str):
        return ""
    # Strip non-printable and control characters (preserve whitespace separators)
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', value)
    # Strip HTML tags
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    # Collapse whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned[:max_length]


def extract_domain(url: str) -> str:
    """Returns the lowercase hostname of a URL, or an empty string when unparseable."""
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def count_words(text: str) -> int:
    """Counts word tokens in an arbitrary text (handles hyphens/apostrophes)."""
    if not text:
        return 0
    return len(re.findall(r"[^\W_]+(?:['-][^\W_]+)*", text))


def content_fingerprint(*parts: str) -> str:
    """SHA-256 fingerprint of joined text parts, used as a stable content hash."""
    joined = "|".join(part for part in parts if part)
    return hashlib.sha256(joined.encode("utf-8", errors="ignore")).hexdigest()


_VIDEO_HOSTS = frozenset({
    "youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "twitch.tv", "tiktok.com",
})
_NEWS_HOSTS = frozenset({
    "apnews.com", "bbc.com", "bbc.co.uk", "cnn.com", "nytimes.com", "reuters.com", "theguardian.com",
})
_BLOG_HOSTS = frozenset({"medium.com", "substack.com"})


def classify_source_type(url: str) -> str:
    """Heuristically classifies a URL into the backend SourceType vocabulary (WEB default)."""
    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.hostname or "").lower()
        path = parsed.path.lower()
    except Exception:
        return "WEB"

    if path.endswith(".pdf"):
        return "PDF"
    if any(host == h or host.endswith("." + h) for h in _VIDEO_HOSTS):
        return "VIDEO"
    if any(host == h or host.endswith("." + h) for h in _BLOG_HOSTS):
        return "BLOG"
    if host.endswith(".news") or any(host == h or host.endswith("." + h) for h in _NEWS_HOSTS):
        return "NEWS"
    return "WEB"


def detect_non_latin_language(text: str) -> Optional[str]:
    """
    Returns a language code only when the text is confidently non-Latin
    (CJK / Cyrillic / Arabic). Returns None otherwise so callers can apply a
    Latin default (e.g. 'en') without inventing a detection.
    """
    if not text:
        return None
    latin = len(re.findall(r"[A-Za-z]", text))
    cjk = len(re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff]", text))
    cyrillic = len(re.findall(r"[\u0400-\u04ff]", text))
    arabic = len(re.findall(r"[\u0600-\u06ff]", text))

    if cjk >= 2 and cjk > latin * 1.5:
        return "zh"
    if cyrillic >= 2 and cyrillic > latin * 1.5:
        return "ru"
    if arabic >= 2 and arabic > latin * 1.5:
        return "ar"
    return None


def coerce_iso_datetime(value: object) -> Optional[str]:
    """
    Returns an ISO-8601 UTC string when the input parses as a datetime, else None.
    Accepts 'YYYY-MM-DD HH:MM:SS' (space-separated) and 'Z' suffixed timestamps.
    """
    if not value:
        return None
    try:
        text = str(value).strip()
        if not text:
            return None
        if "T" not in text:
            text = text.replace(" ", "T", 1)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat()
    except (ValueError, TypeError):
        return None