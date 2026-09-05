import re
from typing import List, Dict, Any, Tuple

POSITIVE_KEYWORDS = {
    "growth", "surge", "innovative", "leader", "breakthrough", "success", "efficient",
    "profit", "strong", "advancement", "promising", "positive", "revolution", "upgrade",
    "record", "booming", "gain", "opportunity", "optimistic", "outperform"
}

NEGATIVE_KEYWORDS = {
    "risk", "drop", "failure", "decline", "slowdown", "threat", "controversy",
    "criticism", "loss", "crash", "delay", "struggle", "vulnerability", "deficit",
    "downturn", "fall", "caution", "dispute", "concern", "lawsuit", "breach"
}

def analyze_sentiment_and_metrics(text: str) -> Tuple[str, Dict[str, int]]:
    """Evaluates text snippet sentiment and builds sentiment breakdown score."""
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
    words = cleaned.split()
    
    pos_count = sum(1 for w in words if w in POSITIVE_KEYWORDS)
    neg_count = sum(1 for w in words if w in NEGATIVE_KEYWORDS)
    
    if pos_count > neg_count:
        sentiment = "positive"
    elif neg_count > pos_count:
        sentiment = "negative"
    else:
        sentiment = "neutral"
        
    return sentiment, {"positive": pos_count, "negative": neg_count}

def clean_snippet(text: str, max_chars: int = 240) -> str:
    cleaned = re.sub(r'\s+', ' ', text).strip()
    if len(cleaned) > max_chars:
        return cleaned[:max_chars].rsplit(' ', 1)[0] + "..."
    return cleaned
