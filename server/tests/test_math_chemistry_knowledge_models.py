"""数学、化学考点库与解题模型库拆分后的回归测试。

覆盖三部分：
1. 数据契约：考点库与模型库非空、内部无重复、两库互不重叠；
2. 预算契约：考点库不再被 token 预算截断（拆分前数学库会被截断）；
3. Prompt 注入：模型段落仅在配置了 models 的学科中出现，且不污染标签映射候选集。
"""

import os
import unittest
from unittest import mock

from llm import (
    CHEMISTRY_KNOWLEDGE_POINTS,
    CHEMISTRY_MODELS,
    MATH_KNOWLEDGE_POINTS,
    MATH_MODELS,
    SUBJECT_CONFIG,
    _estimate_tokens,
    _format_knowledge_points_for_prompt,
    _format_models_for_prompt,
    _map_tags_to_knowledge_points,
    build_analysis_prompt,
    resolve_knowledge_point_token_budget,
)

MODELS_HEADER = "【常用解题模型与易错提醒】"
KNOWLEDGE_HEADER = "【候选核心考点】"
TRUNCATION_HINT = "（候选考点过多"
SMALL_LOCAL_URL = "http://127.0.0.1:1337/v1"


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestMathChemistryKnowledgeModelSplit(unittest.TestCase):
    """校验两大理科考点库与解题模型库的数据契约。"""

    def test_both_lists_are_non_empty(self):
        self.assertGreater(len(MATH_KNOWLEDGE_POINTS), 150)
        self.assertGreater(len(MATH_MODELS), 100)
        self.assertGreater(len(CHEMISTRY_KNOWLEDGE_POINTS), 50)
        self.assertGreater(len(CHEMISTRY_MODELS), 30)

    def test_no_duplicates_within_each_list(self):
        for name, items in (
            ("MATH_KNOWLEDGE_POINTS", MATH_KNOWLEDGE_POINTS),
            ("MATH_MODELS", MATH_MODELS),
            ("CHEMISTRY_KNOWLEDGE_POINTS", CHEMISTRY_KNOWLEDGE_POINTS),
            ("CHEMISTRY_MODELS", CHEMISTRY_MODELS),
        ):
            with self.subTest(list=name):
                self.assertEqual(len(items), len(set(items)))

    def test_lists_are_disjoint(self):
        self.assertEqual(
            set(MATH_KNOWLEDGE_POINTS) & set(MATH_MODELS), set()
        )
        self.assertEqual(
            set(CHEMISTRY_KNOWLEDGE_POINTS) & set(CHEMISTRY_MODELS), set()
        )

    def test_entries_are_clean_single_line_strings(self):
        entries = (
            MATH_KNOWLEDGE_POINTS
            + MATH_MODELS
            + CHEMISTRY_KNOWLEDGE_POINTS
            + CHEMISTRY_MODELS
        )
        for entry in entries:
            self.assertIsInstance(entry, str)
            self.assertTrue(entry.strip())
            self.assertEqual(entry, entry.strip())
            self.assertNotIn("\n", entry)
            self.assertFalse(entry.startswith("- "))

    def test_common_exam_point_names_stay_short(self):
        """常见考点名称必须保留在考点库中，且不被长模型条目淹没。"""
        for name in (
            "切线长定理",
            "解直角三角形",
            "二倍角公式",
            "射影定理",
            "托勒密定理",
            "阿基米德折弦定理",
            "西姆松定理",
        ):
            with self.subTest(point=name):
                self.assertIn(name, MATH_KNOWLEDGE_POINTS)

    def test_math_config_registers_models(self):
        cfg = SUBJECT_CONFIG["数学"]
        self.assertIs(cfg["models"], MATH_MODELS)
        self.assertIs(cfg["knowledge_points"], MATH_KNOWLEDGE_POINTS)

    def test_chemistry_config_registers_models(self):
        cfg = SUBJECT_CONFIG["化学"]
        self.assertIs(cfg["models"], CHEMISTRY_MODELS)
        self.assertIs(cfg["knowledge_points"], CHEMISTRY_KNOWLEDGE_POINTS)


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestKnowledgePointBudgetNotTruncated(unittest.TestCase):
    """拆分后考点库必须能完整塞进默认预算，否则培优考点会被静默丢弃。"""

    def test_math_knowledge_points_fit_budget(self):
        budget = resolve_knowledge_point_token_budget("qwen2.5:7b", SMALL_LOCAL_URL)
        self.assertLess(_estimate_tokens("\n- ".join(MATH_KNOWLEDGE_POINTS)), budget)
        section = _format_knowledge_points_for_prompt(
            MATH_KNOWLEDGE_POINTS, budget
        )
        self.assertNotIn(TRUNCATION_HINT, section)
        for point in MATH_KNOWLEDGE_POINTS:
            self.assertIn(point, section)

    def test_chemistry_knowledge_points_fit_budget(self):
        budget = resolve_knowledge_point_token_budget("qwen2.5:7b", SMALL_LOCAL_URL)
        self.assertLess(
            _estimate_tokens("\n- ".join(CHEMISTRY_KNOWLEDGE_POINTS)), budget
        )
        section = _format_knowledge_points_for_prompt(
            CHEMISTRY_KNOWLEDGE_POINTS, budget
        )
        self.assertNotIn(TRUNCATION_HINT, section)


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestMathChemistryPromptInjection(unittest.TestCase):
    """校验模型段落按学科正确注入 Prompt。"""

    def _prompt(self, subject):
        return build_analysis_prompt(
            subject=subject,
            content="测试内容",
            model="qwen2.5:7b",
            api_url=SMALL_LOCAL_URL,
        )

    def test_math_prompt_contains_models_section(self):
        prompt = self._prompt("数学")
        self.assertEqual(prompt.count(MODELS_HEADER), 1)
        self.assertIn(MATH_MODELS[0], prompt)

    def test_chemistry_prompt_contains_models_section(self):
        prompt = self._prompt("化学")
        self.assertEqual(prompt.count(MODELS_HEADER), 1)
        self.assertIn(CHEMISTRY_MODELS[0], prompt)

    def test_models_section_follows_knowledge_points_section(self):
        prompt = self._prompt("数学")
        self.assertLess(
            prompt.index(KNOWLEDGE_HEADER), prompt.index(MODELS_HEADER)
        )

    def test_models_section_declares_tags_come_from_knowledge_points(self):
        prompt = self._prompt("数学")
        section = prompt[prompt.index(MODELS_HEADER):]
        self.assertIn("tags 必须从上方", section)
        self.assertIn("候选核心考点", section)

    def test_formatter_returns_empty_for_empty_list(self):
        self.assertEqual(_format_models_for_prompt([]), "")

    def test_english_and_chinese_prompt_have_no_models_section(self):
        for subject in ("英语", "语文"):
            with self.subTest(subject=subject):
                self.assertNotIn(MODELS_HEADER, self._prompt(subject))


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestTagMappingUnaffectedByModels(unittest.TestCase):
    """标签映射只能对齐到考点库，模型库不得作为候选集。"""

    def test_standard_tags_map_to_themselves(self):
        for tag in (
            "切线长定理",
            "解直角三角形",
            "二倍角公式",
            "射影定理",
            "托勒密定理",
            "阿基米德折弦定理",
        ):
            with self.subTest(tag=tag):
                mapped = _map_tags_to_knowledge_points(
                    [tag], MATH_KNOWLEDGE_POINTS
                )
                self.assertEqual(mapped, [tag])

    def test_mapped_results_never_come_from_models(self):
        tags = [
            "切线长定理",
            "解直角三角形",
            "二倍角公式",
            "四点共圆判定",
            "相似三角形",
            "韦达定理",
            "存在 90 度角就导角",
        ]
        mapped = _map_tags_to_knowledge_points(tags, MATH_KNOWLEDGE_POINTS)
        for item in mapped:
            self.assertIn(item, MATH_KNOWLEDGE_POINTS)
            self.assertNotIn(item, MATH_MODELS)

    def test_chemistry_tags_map_within_knowledge_points(self):
        mapped = _map_tags_to_knowledge_points(
            ["质量守恒定律", "溶液的配制"], CHEMISTRY_KNOWLEDGE_POINTS
        )
        for item in mapped:
            self.assertIn(item, CHEMISTRY_KNOWLEDGE_POINTS)

    def test_empty_knowledge_points_returns_original_tags(self):
        tags = ["任意标签"]
        self.assertEqual(_map_tags_to_knowledge_points(tags, []), tags)


if __name__ == "__main__":
    unittest.main()