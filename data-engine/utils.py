import re
import urllib.parse


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