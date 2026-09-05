"""similar.py 的单元测试：文本归一化、集合相似度、分类与端到端粗筛。"""
import os
import tempfile
import unittest
from unittest import mock

import db
import similar


class NormalizeTextTests(unittest.TestCase):
    def test_strips_punctuation_whitespace_and_lowercases(self):
        # 去标点/空白/全角并小写；顶点与线段记号（E/BC/AE）被归一为 v
        self.assertEqual(
            similar.normalize_text("如图，点 E 在 BC 上，求 AE 的长度。"),
            "如图点v在v上求v的长度",
        )

    def test_clean_keeps_isolated_letters_as_is(self):
        # 验证底层 clean 不含字母折叠（供归一化内部使用）
        self.assertEqual(similar._clean_text("点 E 在 BC 上"), "点e在bc上")

    def test_fullwidth_to_halfwidth(self):
        # 全角字母/数字/等号 → 半角；° 是符号会被剔除
        self.assertEqual(similar._clean_text("已知ＡＢＣ＝３５°"), "已知abc35")

    def test_digits_are_normalized_to_placeholder(self):
        self.assertEqual(similar.normalize_text("买 3 千克苹果"), "买#千克苹果")
        self.assertEqual(similar.normalize_text("买 35 千克苹果"), "买#千克苹果")

    def test_chinese_digits_are_normalized_too(self):
        # “千”保留（单位词），基础数字 1~9 归一
        self.assertEqual(similar.normalize_text("走了三千米"), "走了#千米")
        self.assertEqual(similar.normalize_text("走了 3000 米"), "走了#米")

    def test_vertex_letter_renaming_is_normalized(self):
        # 同一道题重画后换顶点命名（ABCD→PQRS）在归一化后视为相同
        self.assertEqual(similar.normalize_text("正方形abcd中点e"), "正方形v中点v")
        self.assertEqual(similar.normalize_text("正方形pqrs中点m"), "正方形v中点v")

    def test_consecutive_placeholders_merged(self):
        # 数字归一后合并连续 #；x/y 是短字母记号被归一为 v
        self.assertEqual(similar.normalize_text("x1 + y2 = 3"), "v#v#")


class SetScoresTests(unittest.TestCase):
    def test_identical_sets_have_unit_scores(self):
        bg = similar._bigrams("完全相同的题目内容")
        c, j = similar._set_scores(bg, bg)
        self.assertEqual(c, 1.0)
        self.assertEqual(j, 1.0)

    def test_short_query_containment_high_jaccard_low(self):
        q = similar._bigrams("勾股定理求斜边")
        d = similar._bigrams("已知直角三角形两直角边分别为三和四利用勾股定理求斜边的长度")
        c, j = similar._set_scores(q, d)
        # 查询文本几乎全部命中文档 → containment 很高
        self.assertGreater(c, 0.7)
        # 但文档比查询长得多 → jaccard 明显更低
        self.assertLess(j, c)

    def test_empty_set_returns_zero(self):
        self.assertEqual(similar._set_scores(frozenset(), frozenset(["ab"])), (0.0, 0.0))


class TagsIouTests(unittest.TestCase):
    def test_overlap(self):
        self.assertAlmostEqual(
            similar._tags_iou(["全等", "旋转"], ["全等", "勾股"]), 1 / 3
        )

    def test_empty_side_returns_zero(self):
        self.assertEqual(similar._tags_iou([], ["全等"]), 0.0)


class ClassifyKindTests(unittest.TestCase):
    def test_same_text_is_same(self):
        self.assertEqual(similar._classify_kind(0.95, 0.95, 0.97, long_query=True), "same")

    def test_digit_variant_is_variant(self):
        # 原始分低（数字不同），归一化后分很高 → variant
        self.assertEqual(
            similar._classify_kind(0.55, 0.92, 0.90, long_query=True), "variant"
        )

    def test_weak_when_low_score(self):
        self.assertEqual(
            similar._classify_kind(0.20, 0.20, 0.18, long_query=True), "weak"
        )

    def test_short_query_exact_hit_is_same(self):
        self.assertEqual(similar._classify_kind(0.96, 0.96, 0.96, long_query=False), "same")


class FindSimilarDbTests(unittest.TestCase):
    """端到端：使用临时 sqlite 库验证粗筛的召回与排序。"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        db_path = os.path.join(self._tmp.name, "data.db")
        self._patcher = mock.patch.object(db, "DB_PATH", db_path)
        self._patcher.start()
        db.init_db()
        similar._cache_key = None
        similar._cache_items = None

    def tearDown(self):
        self._patcher.stop()
        self._tmp.cleanup()
        similar._cache_key = None
        similar._cache_items = None

    def _add(self, path, content, tags=(), subject="数学", summary=""):
        db.mark_indexed(
            path,
            title=f"题目：{path}",
            summary=summary or content[:40],
            content=content,
            tags=list(tags),
            subject=subject,
        )

    @staticmethod
    def _norm_path(p: str) -> str:
        """Windows 上 to_db_image_path 会把正斜杠转成反斜杠，统一用 normpath 比较。"""
        return os.path.normpath(p)

    def _seed(self):
        self._add(
            "数学/original.jpg",
            "如图，在正方形 ABCD 中，点 E 是边 BC 的中点，连接 AE 并延长交 DC 的延长线于点 F，求 CF 与 AB 的比值。",
            tags=["全等模型：旋转模型", "正方形性质"],
        )
        self._add(
            "数学/variant.jpg",
            "如图，在正方形 PQRS 中，点 M 是边 QR 的中点，连接 PM 并延长交 SR 的延长线于点 N，求 RN 与 PQ 的比值。",
            tags=["全等模型：旋转模型", "正方形性质"],
        )
        self._add(
            "物理/kinetic.jpg",
            "质量为 2kg 的物体在水平拉力作用下沿光滑水平面运动，拉力做功 10J，求物体的末速度。",
            tags=["动能定理"],
            subject="物理",
        )

    def test_identical_text_recalled_as_same(self):
        self._seed()
        text = "如图，在正方形 ABCD 中，点 E 是边 BC 的中点，连接 AE 并延长交 DC 的延长线于点 F，求 CF 与 AB 的比值。"
        results = similar.find_similar_problems(text, top_k=5)
        self.assertTrue(results)
        top = results[0]
        self.assertEqual(top["file_path"], self._norm_path("数学/original.jpg"))
        self.assertEqual(top["match_kind"], "same")
        # 无标签纯文本查询：combined = 0.6*text_sim，文本完全一致 ≈ 0.6
        self.assertGreaterEqual(top["score"], 0.55)

    def test_letter_renamed_variant_recalled_as_variant(self):
        self._seed()
        # 查询的是 original（ABCD 命名），库里的 variant 题只是重画图换了顶点命名
        # （PQRS 命名），题目结构、数值完全相同 → 应被识别为 variant
        text = "如图，在正方形 ABCD 中，点 E 是边 BC 的中点，连接 AE 并延长交 DC 的延长线于点 F，求 CF 与 AB 的比值。"
        results = similar.find_similar_problems(text, top_k=5)
        variant = next(
            (
                r
                for r in results
                if r["file_path"] == self._norm_path("数学/variant.jpg")
            ),
            None,
        )
        self.assertIsNotNone(variant, "应能召回换顶点命名的同结构变体题")
        self.assertEqual(variant["match_kind"], "variant")
        self.assertGreater(variant["score"], 0.5)

    def test_relevant_tags_help_find_similar_problem(self):
        self._seed()
        # 用“库内题找同类”场景：查询题文字与库内 variant 不同（改过条件），
        # 但知识点标签相同 → tag_sim 帮助其进入候选
        text = "正方形内部一条边上的点连接对角顶点并延长，求线段比值。"
        results = similar.find_similar_problems(
            text,
            query_tags=["全等模型：旋转模型", "正方形性质"],
            top_k=5,
        )
        self.assertTrue(results)

    def test_unrelated_subject_problem_not_ranked_top(self):
        self._seed()
        results = similar.find_similar_problems(
            "正方形顶点连线的几何证明题", query_tags=["正方形性质"], top_k=5
        )
        self.assertFalse(any("物理" in r["file_path"] for r in results[:3]))

    def test_exclude_file_path_skips_self(self):
        self._seed()
        results = similar.find_similar_problems(
            "如图，在正方形 ABCD 中，点 E 是边 BC 的中点，连接 AE 并延长交 DC 的延长线于点 F，求 CF 与 AB 的比值。",
            top_k=5,
            exclude_file_path=self._norm_path("数学/original.jpg"),
        )
        self.assertFalse(
            any(
                r["file_path"] == self._norm_path("数学/original.jpg")
                for r in results
            )
        )
        # 排除自身后，最接近的应是变体题
        self.assertEqual(results[0]["file_path"], self._norm_path("数学/variant.jpg"))

    def test_empty_query_returns_empty(self):
        self._seed()
        self.assertEqual(similar.find_similar_problems("", top_k=5), [])


if __name__ == "__main__":
    unittest.main()
