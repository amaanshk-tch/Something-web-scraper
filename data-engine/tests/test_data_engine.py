import os
import sys
import unittest

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-key")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from bs4 import BeautifulSoup
from main import decode_duckduckgo_href, extract_result_from_card
from sentiment import analyze_sentiment_and_metrics, clean_snippet


class SentimentTests(unittest.TestCase):
    def test_classifies_positive_negative_and_tied_text(self):
        self.assertEqual(analyze_sentiment_and_metrics("growth breakthrough")[0], "positive")
        self.assertEqual(analyze_sentiment_and_metrics("risk decline")[0], "negative")
        self.assertEqual(analyze_sentiment_and_metrics("growth risk")[0], "neutral")

    def test_trims_a_long_snippet_at_a_word_boundary(self):
        self.assertEqual(clean_snippet("one two three four", max_chars=10), "one two...")


class SearchParsingTests(unittest.TestCase):
    def test_decodes_duckduckgo_redirect_url(self):
        url = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle"
        self.assertEqual(decode_duckduckgo_href(url), "https://example.com/article")

    def test_parses_a_result_card_as_a_single_unit(self):
        card = BeautifulSoup(
            '<div class="result"><a class="result__a" href="https://example.com">Example title</a>'
            '<a class="result__url" href="https://example.com">example.com</a>'
            '<span class="result__snippet">Example snippet</span></div>',
            "html.parser",
        ).div
        self.assertEqual(extract_result_from_card(card), {
            "url": "https://example.com",
            "title": "Example title",
            "snippet": "Example snippet",
        })

    def test_rejects_malformed_result_card(self):
        card = BeautifulSoup('<div class="result"><span class="result__snippet">No link</span></div>', "html.parser").div
        self.assertIsNone(extract_result_from_card(card))


if __name__ == "__main__":
    unittest.main()