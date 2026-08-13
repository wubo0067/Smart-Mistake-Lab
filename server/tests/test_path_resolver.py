import os
import tempfile
import unittest
from pathlib import Path

from path_resolver import (
    is_path_within_directory,
    resolve_image_path,
    to_db_image_path,
)


class ResolveImagePathTests(unittest.TestCase):
    def test_converts_cross_machine_absolute_path_to_relative_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            image_dir = os.path.join(tmpdir, "mistake-images")
            os.makedirs(image_dir, exist_ok=True)

            converted = to_db_image_path(
                r"L:\old-machine\mistake-images\math\problem1.jpg", image_dir
            )

            self.assertEqual(converted, "math/problem1.jpg")

    def test_resolves_same_basename_under_configured_image_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            image_dir = os.path.join(tmpdir, "mistake-images")
            os.makedirs(os.path.join(image_dir, "math"), exist_ok=True)
            actual_path = os.path.join(image_dir, "math", "problem1.jpg")
            Path(actual_path).write_bytes(b"img")

            resolved = resolve_image_path(
                r"L:\old-machine\mistake-images\math\problem1.jpg", image_dir
            )

            self.assertEqual(resolved, actual_path)

    def test_returns_existing_path_directly(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            existing_path = os.path.join(tmpdir, "problem2.jpg")
            Path(existing_path).write_bytes(b"img")

            resolved = resolve_image_path(existing_path, tmpdir)

            self.assertEqual(resolved, existing_path)

    def test_cross_drive_paths_are_rejected_without_crashing(self):
        self.assertFalse(
            is_path_within_directory(
                r"D:\images\math\problem1.jpg", r"E:\mistake-images"
            )
        )
        self.assertFalse(
            is_path_within_directory(
                r"E:\mistake-images\math\problem1.jpg", r"D:\mistake-images"
            )
        )


if __name__ == "__main__":
    unittest.main()
