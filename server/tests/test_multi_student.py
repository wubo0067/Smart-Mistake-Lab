import os
import tempfile
import unittest

import db


class MultiStudentTests(unittest.TestCase):
    """验证多学生账户：数据按学生隔离，全家 token 统计正确累加"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._orig_data_dir = db.DATA_DIR
        self._orig_students_db = db.STUDENTS_DB_PATH
        self._orig_db_path = db.DB_PATH
        db.DATA_DIR = self._tmp.name
        db.STUDENTS_DB_PATH = os.path.join(self._tmp.name, "students.db")
        db.DB_PATH = os.path.join(self._tmp.name, db.DEFAULT_DB_NAME)
        db.init_students_db()

    def tearDown(self):
        db.DATA_DIR = self._orig_data_dir
        db.STUDENTS_DB_PATH = self._orig_students_db
        db.DB_PATH = self._orig_db_path
        self._tmp.cleanup()

    def _use(self, student_id):
        return db.set_current_db(db.resolve_student_db(student_id))

    def test_default_student_seeded(self):
        students = db.list_students()
        self.assertEqual(len(students), 1)
        self.assertEqual(students[0]["db_file"], db.DEFAULT_DB_NAME)

    def test_create_student_makes_own_db(self):
        s = db.create_student("小明")
        self.assertTrue(s["db_file"].endswith(".db"))
        self.assertNotEqual(s["db_file"], db.DEFAULT_DB_NAME)
        self.assertTrue(os.path.exists(os.path.join(db.DATA_DIR, s["db_file"])))
        # 新库里应有完整表结构
        token = self._use(s["id"])
        conn = db.get_db()
        try:
            conn.execute("SELECT COUNT(*) FROM images").fetchone()
            conn.execute("SELECT COUNT(*) FROM ai_token_total").fetchone()
        finally:
            conn.close()
            db.reset_current_db(token)

    def test_data_isolation_between_students(self):
        a = db.create_student("学生A")
        b = db.create_student("学生B")

        ta = self._use(a["id"])
        conn = db.get_db()
        conn.execute(
            "INSERT INTO images (file_path, file_name, subject, title, indexed_at, created_at)"
            " VALUES ('a.jpg', 'a.jpg', '数学', 'A的题', '2026-01-01', '2026-01-01')"
        )
        conn.commit()
        conn.close()
        db.record_token_usage("problem_ai", "m", 100, 50, 150, 10)
        db.reset_current_db(ta)

        tb = self._use(b["id"])
        conn = db.get_db()
        n = conn.execute("SELECT COUNT(*) AS c FROM images").fetchone()["c"]
        conn.close()
        self.assertEqual(n, 0)  # B 看不到 A 的错题
        stats_b = db.get_token_stats()
        self.assertEqual(stats_b["grand"]["history"]["total"], 0)  # B 看不到 A 的消耗
        db.reset_current_db(tb)

        tc = self._use(a["id"])
        conn = db.get_db()
        n = conn.execute("SELECT COUNT(*) AS c FROM images").fetchone()["c"]
        conn.close()
        self.assertEqual(n, 1)
        stats_a = db.get_token_stats()
        self.assertEqual(stats_a["grand"]["history"]["total"], 150)
        db.reset_current_db(tc)

    def test_family_token_stats_sums_all_students(self):
        a = db.create_student("学生A")
        b = db.create_student("学生B")

        ta = self._use(a["id"])
        db.record_token_usage("problem_ai", "m", 100, 50, 150, 10)
        db.record_token_usage("image_analysis", "m", 200, 20, 220, 0)
        db.reset_current_db(ta)

        tb = self._use(b["id"])
        db.record_token_usage("problem_ai", "m", 30, 10, 40, 5)
        db.reset_current_db(tb)

        # 默认库（未分配消耗）也参与遍历，不影响合计
        family = db.get_family_token_stats()
        self.assertEqual(family["grand"]["history"]["total"], 150 + 220 + 40)
        self.assertEqual(family["grand"]["history"]["cached"], 10 + 0 + 5)
        self.assertEqual(family["categories"]["problem_ai"]["history"]["total"], 190)
        self.assertEqual(family["categories"]["image_analysis"]["history"]["total"], 220)
        names = {s["name"] for s in family["students"]}
        self.assertIn("学生A", names)
        self.assertIn("学生B", names)
        by_name = {s["name"]: s for s in family["students"]}
        self.assertEqual(by_name["学生A"]["grand"]["history"]["total"], 370)
        self.assertEqual(by_name["学生B"]["grand"]["history"]["total"], 40)

    def test_resolve_fallback_and_delete(self):
        a = db.create_student("学生A")
        # 无效 id 回退到第一个学生
        self.assertEqual(db.resolve_student_db(99999), db.list_students()[0]["db_file"])
        self.assertEqual(db.resolve_student_db(None), db.list_students()[0]["db_file"])
        self.assertEqual(db.resolve_student_db(a["id"]), a["db_file"])

        db.rename_student(a["id"], "改名A")
        self.assertEqual(db.get_student(a["id"])["name"], "改名A")

        db.delete_student(a["id"])
        self.assertIsNone(db.get_student(a["id"]))
        self.assertFalse(os.path.exists(os.path.join(db.DATA_DIR, a["db_file"])))
        # 不允许删除最后一个学生
        only = db.list_students()[0]
        with self.assertRaises(ValueError):
            db.delete_student(only["id"])


if __name__ == "__main__":
    unittest.main()
