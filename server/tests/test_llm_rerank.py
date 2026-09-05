"""llm.py 相似题精排解析函数的单元测试（不涉及真实 AI 调用）。"""
import unittest

from llm import parse_similar_rerank_result


class ParseSimilarRerankResultTests(unittest.TestCase):
    def test_ranked_object(self):
        raw = '{"ranked": [{"index": 3, "kind": "variant", "reason": "只换了数字"}]}'
        self.assertEqual(
            parse_similar_rerank_result(raw),
            [{"index": 3, "kind": "variant", "reason": "只换了数字"}],
        )

    def test_top_level_array(self):
        raw = '[{"index": 0, "kind": "same", "reason": "同一道题"}]'
        self.assertEqual(
            parse_similar_rerank_result(raw),
            [{"index": 0, "kind": "same", "reason": "同一道题"}],
        )

    def test_noisy_text_around_json(self):
        raw = (
            "好的，我来分析。\n```json\n"
            '{"ranked": [{"index": 1, "kind": "similar", "reason": "同考勾股定理"}]}\n'
            "```\n"
        )
        self.assertEqual(
            parse_similar_rerank_result(raw),
            [{"index": 1, "kind": "similar", "reason": "同考勾股定理"}],
        )

    def test_unknown_kind_is_dropped(self):
        raw = (
            '{"ranked": [{"index": 0, "kind": "same", "reason": "ok"},'
            ' {"index": 1, "kind": "banana", "reason": "no"}]}'
        )
        self.assertEqual(
            parse_similar_rerank_result(raw),
            [{"index": 0, "kind": "same", "reason": "ok"}],
        )

    def test_duplicate_index_keeps_first(self):
        raw = (
            '{"ranked": [{"index": 2, "kind": "same", "reason": "a"},'
            ' {"index": 2, "kind": "similar", "reason": "b"}]}'
        )
        self.assertEqual(
            parse_similar_rerank_result(raw),
            [{"index": 2, "kind": "same", "reason": "a"}],
        )

    def test_empty_ranked(self):
        self.assertEqual(parse_similar_rerank_result('{"ranked": []}'), [])
        self.assertEqual(parse_similar_rerank_result(""), [])
        self.assertEqual(parse_similar_rerank_result("完全不是 JSON"), [])

    def test_kind_case_and_whitespace_normalized(self):
        raw = '{"ranked": [{"index": 0, "kind": "  Variant ", "reason": "x"}]}'
        self.assertEqual(
            parse_similar_rerank_result(raw),
            [{"index": 0, "kind": "variant", "reason": "x"}],
        )


if __name__ == "__main__":
    unittest.main()
