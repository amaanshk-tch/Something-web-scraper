import os
import sys
import unittest

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-key")
os.environ.setdefault("ALLOW_MOCK_PROVIDER", "1")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from bs4 import BeautifulSoup
from main import get_limiter_key
from search_providers import (
    get_provider,
    MockSearchProvider,
    decode_duckduckgo_href,
    extract_result_from_card,
)
from sentiment import analyze_sentiment_and_metrics, clean_snippet
from utils import (
    classify_source_type,
    coerce_iso_datetime,
    content_fingerprint,
    count_words,
    detect_non_latin_language,
    extract_domain,
)


class SentimentTests(unittest.TestCase):
    def test_classifies_positive_negative_and_tied_text(self):
        self.assertEqual(analyze_sentiment_and_metrics("growth breakthrough")[0], "positive")
        self.assertEqual(analyze_sentiment_and_metrics("risk decline")[0], "negative")
        self.assertEqual(analyze_sentiment_and_metrics("growth risk")[0], "neutral")

    def test_describes_signal_output_as_lexical_signal_not_analytical_findings(self):
        provider = get_provider("mock")
        results = provider.search("test query", depth=2)
        self.assertEqual(results, [
            {
                "url": "https://example.com/alpha",
                "title": "test query headline",
                "snippet": "Sample retrieved signal from the mock provider.",
            },
            {
                "url": "https://example.com/beta",
                "title": "test query follow-up",
                "snippet": "Another sample source snippet for the mock provider.",
            },
        ])

    def test_trims_a_long_snippet_at_a_word_boundary(self):
        self.assertEqual(clean_snippet("one two three four", max_chars=10), "one two...")


class ProviderRegistrationTests(unittest.TestCase):
    def test_provider_factory_returns_a_supported_provider(self):
        provider = get_provider("mock")
        self.assertIsInstance(provider, MockSearchProvider)

    def test_provider_factory_rejects_unknown_provider(self):
        with self.assertRaises(ValueError):
            get_provider("unknown-provider")

    def test_provider_factory_rejects_removed_bing_provider(self):
        with self.assertRaises(ValueError):
            get_provider("bing")

    def test_provider_factory_rejects_mock_when_disallowed(self):
        os.environ["ALLOW_MOCK_PROVIDER"] = "0"
        try:
            with self.assertRaises(ValueError):
                get_provider("mock")
        finally:
            os.environ["ALLOW_MOCK_PROVIDER"] = "1"


class MetadataDerivationTests(unittest.TestCase):
    def test_extract_domain_parses_hostname(self):
        self.assertEqual(extract_domain("https://www.Example.com/path?q=1"), "www.example.com")
        self.assertEqual(extract_domain("not-a-url"), "")

    def test_classify_source_type_heuristics(self):
        self.assertEqual(classify_source_type("https://example.com/report.pdf"), "PDF")
        self.assertEqual(classify_source_type("https://www.youtube.com/watch?v=x"), "VIDEO")
        self.assertEqual(classify_source_type("https://substack.com/post"), "BLOG")
        self.assertEqual(classify_source_type("https://www.reuters.com/markets"), "NEWS")
        self.assertEqual(classify_source_type("https://example.com/article"), "WEB")

    def test_content_fingerprint_is_stable_and_distinct(self):
        self.assertEqual(content_fingerprint("a", "b"), content_fingerprint("a", "b"))
        self.assertNotEqual(content_fingerprint("a", "b"), content_fingerprint("a", "c"))

    def test_count_words_counts_tokens(self):
        self.assertEqual(count_words("one two three"), 3)
        self.assertEqual(count_words(""), 0)

    def test_detect_non_latin_language_only_when_confident(self):
        self.assertEqual(detect_non_latin_language("中国市场增长趋势分析"), "zh")
        self.assertEqual(detect_non_latin_language("Growth in the global market"), None)

    def test_coerce_iso_datetime_accepts_common_formats(self):
        self.assertEqual(coerce_iso_datetime("2025-03-02T10:00:00Z"), "2025-03-02T10:00:00+00:00")
        self.assertTrue(coerce_iso_datetime("2025-03-02 10:00:00") is not None)
        self.assertIsNone(coerce_iso_datetime("Mar 2, 2025"))
        self.assertIsNone(coerce_iso_datetime(None))


class RateLimiterKeyTests(unittest.TestCase):
    def test_get_limiter_key_prefers_user_id_header(self):
        class DummyRequest:
            headers = {
                'X-User-Id': 'user-42',
                'X-Request-Id': 'request-789',
            }

        self.assertEqual(get_limiter_key(DummyRequest()), 'user:user-42')


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