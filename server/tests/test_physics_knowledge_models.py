"""物理考点库与解题模型库拆分后的回归测试。

覆盖两部分：
1. 数据契约：考点库与模型库非空、内部无重复、两库互不重叠；
2. Prompt 注入：模型段落仅在配置了 models 的学科中出现，且不污染标签映射候选集。
"""

import os
import unittest
from unittest import mock

from llm import (
    DEFAULT_MODEL_HINT_TOKENS,
    DEFAULT_SUBJECT_CONFIG,
    LARGE_MODEL_HINT_TOKENS,
    PHYSICS_KNOWLEDGE_POINTS,
    PHYSICS_MODELS,
    SUBJECT_CONFIG,
    _format_knowledge_points_for_prompt,
    _format_models_for_prompt,
    _map_tags_to_knowledge_points,
    build_analysis_prompt,
    resolve_knowledge_point_token_budget,
    resolve_model_hint_token_budget,
)

MODELS_HEADER = "【常用解题模型与易错提醒】"
KNOWLEDGE_HEADER = "【候选核心考点】"
SMALL_LOCAL_URL = "http://127.0.0.1:1337/v1"


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestPhysicsKnowledgeModelSplit(unittest.TestCase):
    """校验考点库与解题模型库的数据契约。"""

    def test_both_lists_are_non_empty(self):
        self.assertGreater(len(PHYSICS_KNOWLEDGE_POINTS), 200)
        self.assertGreater(len(PHYSICS_MODELS), 40)

    def test_no_duplicates_within_each_list(self):
        self.assertEqual(
            len(PHYSICS_KNOWLEDGE_POINTS), len(set(PHYSICS_KNOWLEDGE_POINTS))
        )
        self.assertEqual(len(PHYSICS_MODELS), len(set(PHYSICS_MODELS)))

    def test_lists_are_disjoint(self):
        overlap = set(PHYSICS_KNOWLEDGE_POINTS) & set(PHYSICS_MODELS)
        self.assertEqual(overlap, set())

    def test_entries_are_clean_single_line_strings(self):
        for entry in PHYSICS_KNOWLEDGE_POINTS + PHYSICS_MODELS:
            self.assertIsInstance(entry, str)
            self.assertTrue(entry.strip())
            self.assertEqual(entry, entry.strip())
            self.assertNotIn("\n", entry)
            # 列表项本身不再带 Markdown 前缀，前缀由格式化函数统一添加
            self.assertFalse(entry.startswith("- "))

    def test_knowledge_points_are_short_exam_point_names(self):
        """考点库只保留标准考点名称，不再混入口诀式长条目。"""
        too_long = [p for p in PHYSICS_KNOWLEDGE_POINTS if len(p) > 40]
        self.assertEqual(too_long, [])

    def test_physics_config_registers_models(self):
        cfg = SUBJECT_CONFIG["物理"]
        self.assertIs(cfg["models"], PHYSICS_MODELS)
        self.assertIs(cfg["knowledge_points"], PHYSICS_KNOWLEDGE_POINTS)

    def test_other_subjects_have_empty_models(self):
        self.assertEqual(DEFAULT_SUBJECT_CONFIG["models"], [])
        for subject, cfg in SUBJECT_CONFIG.items():
            self.assertIn("models", cfg)
            if subject in ("英语", "语文"):
                self.assertEqual(cfg["models"], [])


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestModelHintPromptSection(unittest.TestCase):
    """校验解题模型段落的生成与注入行为。"""

    def test_formatter_returns_empty_for_empty_list(self):
        self.assertEqual(_format_models_for_prompt([]), "")

    def test_formatter_emits_header_and_all_models(self):
        section = _format_models_for_prompt(PHYSICS_MODELS, 10**6)
        self.assertTrue(section.startswith(MODELS_HEADER))
        for entry in PHYSICS_MODELS:
            self.assertIn(f"- {entry}", section)

    def test_formatter_warns_when_truncated(self):
        section = _format_models_for_prompt(PHYSICS_MODELS, 200)
        self.assertIn("（解题模型过多", section)
        self.assertLess(section.count("\n- "), len(PHYSICS_MODELS))

    def test_formatter_keeps_at_least_one_entry_under_tiny_budget(self):
        section = _format_models_for_prompt(PHYSICS_MODELS, 1)
        self.assertEqual(section.count("\n- "), 1)

    def test_formatter_declares_tags_must_come_from_knowledge_points(self):
        section = _format_models_for_prompt(PHYSICS_MODELS, 10**6)
        self.assertIn("tags 必须从上方", section)
        self.assertIn("候选核心考点", section)

    def test_resolve_model_hint_budget_defaults_to_constant(self):
        self.assertEqual(
            resolve_model_hint_token_budget("qwen2.5:7b", SMALL_LOCAL_URL),
            DEFAULT_MODEL_HINT_TOKENS,
        )

    def test_resolve_model_hint_budget_env_override(self):
        with mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "123"}):
            self.assertEqual(
                resolve_model_hint_token_budget("qwen2.5:7b", SMALL_LOCAL_URL), 123
            )

    def test_resolve_model_hint_budget_matches_knowledge_budget_tiering(self):
        cases = [
            ("qwen2.5:7b", SMALL_LOCAL_URL),
            ("gpt-4o", "https://api.openai.com"),
            ("claude-sonnet-4", "https://api.anthropic.com"),
        ]
        for model, api_url in cases:
            with self.subTest(model=model):
                kp_budget = resolve_knowledge_point_token_budget(model, api_url)
                hint_budget = resolve_model_hint_token_budget(model, api_url)
                expected = (
                    LARGE_MODEL_HINT_TOKENS
                    if kp_budget > DEFAULT_MODEL_HINT_TOKENS
                    else DEFAULT_MODEL_HINT_TOKENS
                )
                self.assertEqual(hint_budget, expected)

    def test_physics_prompt_contains_exactly_one_models_section(self):
        prompt = build_analysis_prompt(
            subject="物理", content="物体在水中受到的浮力", model="qwen2.5:7b",
            api_url=SMALL_LOCAL_URL,
        )
        self.assertEqual(prompt.count(MODELS_HEADER), 1)

    def test_models_section_follows_knowledge_points_section(self):
        prompt = build_analysis_prompt(
            subject="物理", content="物体在水中受到的浮力", model="qwen2.5:7b",
            api_url=SMALL_LOCAL_URL,
        )
        self.assertGreater(prompt.index(MODELS_HEADER), prompt.index(KNOWLEDGE_HEADER))

    def test_physics_prompt_fits_all_models_under_default_budget(self):
        prompt = build_analysis_prompt(
            subject="物理", content="物体在水中受到的浮力", model="qwen2.5:7b",
            api_url=SMALL_LOCAL_URL,
        )
        section = prompt[prompt.index(MODELS_HEADER):]
        self.assertNotIn("（解题模型过多", section)
        for entry in PHYSICS_MODELS:
            self.assertIn(f"- {entry}", section)

    def test_other_subjects_prompt_has_no_models_section(self):
        for subject in ["英语", "语文"]:
            with self.subTest(subject=subject):
                prompt = build_analysis_prompt(
                    subject=subject, content="测试内容", model="qwen2.5:7b",
                    api_url=SMALL_LOCAL_URL,
                )
                self.assertNotIn(MODELS_HEADER, prompt)

    def test_knowledge_points_section_still_lists_all_points(self):
        section = _format_knowledge_points_for_prompt(
            PHYSICS_KNOWLEDGE_POINTS,
            resolve_knowledge_point_token_budget("qwen2.5:7b", SMALL_LOCAL_URL),
        )
        self.assertNotIn("（候选考点过多", section)
        self.assertEqual(section.count("\n- "), len(PHYSICS_KNOWLEDGE_POINTS))


@mock.patch.dict(os.environ, {"MODEL_HINT_TOKENS": "", "KNOWLEDGE_POINT_TOKENS": ""})
class TestTagMappingUnaffectedByModels(unittest.TestCase):
    """解题模型不得进入标签映射候选集。"""

    def test_representative_tags_map_to_standard_points(self):
        cases = {
            "浮力": "浮力",
                "凸透镜成像规律": "凸透镜成像规律及实验（物距与成像性质、像距的关系）",
            "惯性": "惯性",
            "安培定则": "通电螺线管的磁场与安培定则",
            "控制变量法": "控制变量法",
            "整体法": "整体法与隔离法（连接体受力分析）",
        }
        for tag, expected in cases.items():
            with self.subTest(tag=tag):
                mapped = _map_tags_to_knowledge_points([tag], PHYSICS_KNOWLEDGE_POINTS)
                self.assertEqual(mapped, [expected])

    def test_empty_tag_list_returns_empty(self):
        self.assertEqual(_map_tags_to_knowledge_points([], PHYSICS_KNOWLEDGE_POINTS), [])

    def test_exact_knowledge_point_tag_is_never_rewritten(self):
        """精确命中的标准考点必须原样返回，不被长条目或模糊匹配改写。"""
        for point in PHYSICS_KNOWLEDGE_POINTS:
            with self.subTest(point=point):
                mapped = _map_tags_to_knowledge_points([point], PHYSICS_KNOWLEDGE_POINTS)
                self.assertEqual(mapped, [point])

    def test_mapping_still_ignores_models_when_passed_only_knowledge_points(self):
        mapped = _map_tags_to_knowledge_points(PHYSICS_MODELS, PHYSICS_KNOWLEDGE_POINTS)
        for result in mapped:
            self.assertIn(result, PHYSICS_KNOWLEDGE_POINTS)


if __name__ == "__main__":
    unittest.main()