"""AI 解题禁用知识点（黑名单）的回归测试。

覆盖：
1. 内置 + 自定义黑名单的合并去重与条数/长度上限；
2. 候选考点/解题模型的过滤（含误伤回归）；
3. Prompt 段落注入位置、步骤编号与空列表兼容；
4. server 层配置值的归一化。
"""

import json
import os
import unittest
from unittest import mock

from llm import (
    MAX_BLACKLIST_ITEMS,
    MATH_KNOWLEDGE_POINTS,
    SUBJECT_CONFIG,
    _filter_blacklisted,
    _format_blacklist_for_prompt,
    _map_tags_to_knowledge_points,
    _merge_blacklist_knowledges,
    build_analysis_prompt,
)
from server import _normalize_blacklist_knowledges

BLACKLIST_HEADER = "【禁止使用的知识点（硬性约束）】"
STEPS_HEADER = "【步骤】"
MODELS_HEADER = "【常用解题模型与易错提醒】"


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestBlacklistMergeAndFilter(unittest.TestCase):
    def test_merge_dedupes_and_keeps_order(self):
        merged = _merge_blacklist_knowledges(
            ["韦达定理", " 导数 "],
            ["导数", "相似三角形", "", None],
        )
        self.assertEqual(merged, ["韦达定理", "导数", "相似三角形"])

    def test_merge_handles_none(self):
        self.assertEqual(_merge_blacklist_knowledges(None, None), [])

    def test_filter_removes_matching_items(self):
        items = ["勾股定理", "全等三角形判定", "导数与微分"]
        self.assertEqual(
            _filter_blacklisted(items, ["勾股定理", "导数"]),
            ["全等三角形判定"],
        )

    def test_filter_returns_original_when_blacklist_empty(self):
        items = ["勾股定理"]
        self.assertIs(_filter_blacklisted(items, []), items)

    def test_formatter_returns_empty_for_empty_list(self):
        self.assertEqual(_format_blacklist_for_prompt([]), "")

    def test_single_char_blacklist_only_matches_exactly(self):
        # 单字黑名单不应把包含该字的考点全部误杀
        items = ["数", "有理数运算", "一次函数"]
        self.assertEqual(_filter_blacklisted(items, ["数"]), ["有理数运算", "一次函数"])

    def test_builtin_blacklist_does_not_kill_normal_points(self):
        # 内置黑名单不得误伤初中正常考点/解题模型（跨词、反向包含导致的误杀）
        must_keep = [
            "二次函数与几何图形面积分割",
            "先联立求交点，再用割补法或积分思想（初中用矩形/三角形拼凑）",
        ]
        blacklist = SUBJECT_CONFIG["数学"]["blacklist_knowledges"]
        self.assertEqual(_filter_blacklisted(must_keep, blacklist), must_keep)
        physics = SUBJECT_CONFIG["物理"]["blacklist_knowledges"]
        self.assertEqual(
            _filter_blacklisted(
                ["牛顿第二定律", "机械能守恒", "电磁感应"], physics
            ),
            ["牛顿第二定律", "机械能守恒", "电磁感应"],
        )
        english = SUBJECT_CONFIG["英语"]["blacklist_knowledges"]
        self.assertEqual(
            _filter_blacklisted(["非谓语动词"], english), ["非谓语动词"]
        )

    def test_merge_drops_overlong_items(self):
        long_name = "超" * 40
        self.assertEqual(
            _merge_blacklist_knowledges([long_name, "导数"]), ["导数"]
        )

    def test_merge_caps_total_items(self):
        merged = _merge_blacklist_knowledges(
            [f"自定义考点{i}" for i in range(MAX_BLACKLIST_ITEMS + 20)]
        )
        self.assertEqual(len(merged), MAX_BLACKLIST_ITEMS)


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestBlacklistPromptInjection(unittest.TestCase):
    def _prompt(self, subject="数学", **kwargs):
        return build_analysis_prompt(
            subject=subject,
            content="测试内容",
            model="qwen2.5:7b",
            api_url="http://127.0.0.1:1337/v1",
            **kwargs,
        )

    def test_builtin_blacklist_is_injected(self):
        prompt = self._prompt()
        self.assertEqual(prompt.count(BLACKLIST_HEADER), 1)
        self.assertIn(SUBJECT_CONFIG["数学"]["blacklist_knowledges"][0], prompt)

    def test_section_sits_between_models_and_steps(self):
        prompt = self._prompt()
        self.assertLess(prompt.index(MODELS_HEADER), prompt.index(BLACKLIST_HEADER))
        self.assertLess(prompt.index(BLACKLIST_HEADER), prompt.index(STEPS_HEADER))

    def test_custom_blacklist_is_merged_and_filters_candidates(self):
        prompt = self._prompt(blacklist_knowledges=["勾股定理"])
        self.assertIn("- 勾股定理", prompt)
        candidates = prompt[
            prompt.index("【候选核心考点】") : prompt.index(MODELS_HEADER)
        ]
        self.assertNotIn("勾股定理", candidates)

    def test_blacklisted_point_still_exists_in_library(self):
        # 过滤只作用于 Prompt 候选列表，不修改全局考点库
        self.assertIn("勾股定理", MATH_KNOWLEDGE_POINTS)

    def test_step_numbering_without_blacklist(self):
        prompt = build_analysis_prompt(
            subject="历史",
            content="测试内容",
            model="qwen2.5:7b",
            api_url="http://127.0.0.1:1337/v1",
        )
        self.assertNotIn(BLACKLIST_HEADER, prompt)
        self.assertIn("5. 判断题目难度", prompt)

    def test_step_numbering_with_blacklist(self):
        prompt = self._prompt()
        self.assertIn("5. 输出前对照", prompt)
        self.assertIn("6. 判断题目难度", prompt)


class TestServerBlacklistNormalization(unittest.TestCase):
    def test_accepts_json_array(self):
        self.assertEqual(
            _normalize_blacklist_knowledges(["韦达定理", "韦达定理", " "]),
            ["韦达定理"],
        )

    def test_accepts_json_string(self):
        value = json.dumps(["导数", "积分"], ensure_ascii=False)
        self.assertEqual(_normalize_blacklist_knowledges(value), ["导数", "积分"])

    def test_accepts_plain_text_lines(self):
        self.assertEqual(
            _normalize_blacklist_knowledges("韦达定理\n相似三角形，导数"),
            ["韦达定理", "相似三角形", "导数"],
        )

    def test_rejects_invalid_values(self):
        self.assertEqual(_normalize_blacklist_knowledges(None), [])
        self.assertEqual(_normalize_blacklist_knowledges(123), [])

    def test_drops_overlong_and_caps_count(self):
        self.assertEqual(
            _normalize_blacklist_knowledges(["导" * 40, "导数"]), ["导数"]
        )
        many = "\n".join(f"考点{i}" for i in range(MAX_BLACKLIST_ITEMS + 10))
        self.assertEqual(len(_normalize_blacklist_knowledges(many)), MAX_BLACKLIST_ITEMS)


class TestTagsBlacklistFallback(unittest.TestCase):
    def test_tags_filtered_when_library_empty(self):
        # 未知学科/空考点库时映射函数原样返回标签，需再按黑名单兜底过滤
        mapped = _map_tags_to_knowledge_points(["导数与微分", "勾股定理"], [])
        self.assertEqual(
            _filter_blacklisted(mapped, SUBJECT_CONFIG["数学"]["blacklist_knowledges"]),
            ["勾股定理"],
        )


if __name__ == "__main__":
    unittest.main()
