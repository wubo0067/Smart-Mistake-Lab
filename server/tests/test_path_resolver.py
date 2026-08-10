import os
import tempfile
import unittest
from pathlib import Path

from path_resolver import resolve_image_path


class ResolveImagePathTests(unittest.TestCase):
    def test_resolves_same_basename_under_configured_image_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            image_dir = os.path.join(tmpdir, "错题目录")
            os.makedirs(os.path.join(image_dir, "数学"), exist_ok=True)
            actual_path = os.path.join(image_dir, "数学", "题1.jpg")
            Path(actual_path).write_bytes(b"img")

            resolved = resolve_image_path(r"L:\旧机器\错题目录\数学\题1.jpg", image_dir)

            self.assertEqual(resolved, actual_path)

    def test_returns_existing_path_directly(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            existing_path = os.path.join(tmpdir, "题2.jpg")
            Path(existing_path).write_bytes(b"img")

            resolved = resolve_image_path(existing_path, tmpdir)

            self.assertEqual(resolved, existing_path)


if __name__ == "__main__":
    unittest.main()
