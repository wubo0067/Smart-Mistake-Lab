import os
import sqlite3
import tempfile
import unittest

import db


class MigratePracticeLogTests(unittest.TestCase):
    """验证跨机器拷贝 data.db 后，practice_log 与 images 的路径会一起迁移为相对路径"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.image_dir = os.path.join(self._tmp.name, "mistake-images")
        os.makedirs(os.path.join(self.image_dir, "math"), exist_ok=True)

        self._orig_db_path = db.DB_PATH
        self._tmp_db = os.path.join(self._tmp.name, "data.db")
        db.DB_PATH = self._tmp_db

        db.init_db()
        db.set_config_value("image_dir", self.image_dir)

    def tearDown(self):
        db.DB_PATH = self._orig_db_path
        self._tmp.cleanup()

    def _seed_old_machine_rows(self):
        """插入旧机器上的绝对路径记录（images 与 practice_log）"""
        old_path = r"L:\old-machine\mistake-images\math\problem1.jpg"
        conn = db.get_db()
        conn.execute(
            """INSERT INTO images
               (file_path, file_name, subject, title, indexed_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                old_path,
                "problem1.jpg",
                "math",
                "Math Problem 1",
                "2026-08-10 10:00:00",
                "2026-08-10 10:00:00",
            ),
        )
        conn.execute(
            "INSERT INTO practice_log (file_path, action, created_at) VALUES (?, ?, ?)",
            (old_path, "edit_solution", "2026-08-10 21:17:10"),
        )
        conn.commit()
        conn.close()

    def test_migration_aligns_practice_log_with_images(self):
        self._seed_old_machine_rows()

        migrated = db.migrate_existing_paths_to_relative(self.image_dir)

        self.assertEqual(migrated, 2)

        conn = db.get_db()
        img_path = conn.execute("SELECT file_path FROM images LIMIT 1").fetchone()[0]
        log_path = conn.execute(
            "SELECT file_path FROM practice_log LIMIT 1"
        ).fetchone()[0]
        conn.close()

        self.assertEqual(img_path, "math/problem1.jpg")
        self.assertEqual(log_path, "math/problem1.jpg")

    def test_timeline_join_succeeds_after_migration(self):
        self._seed_old_machine_rows()
        db.migrate_existing_paths_to_relative(self.image_dir)

        conn = db.get_db()
        orphan_count = conn.execute("""SELECT COUNT(*) FROM practice_log pl
               LEFT JOIN images img ON img.file_path = pl.file_path
               WHERE img.file_path IS NULL""").fetchone()[0]
        conn.close()

        self.assertEqual(orphan_count, 0)


if __name__ == "__main__":
    unittest.main()
