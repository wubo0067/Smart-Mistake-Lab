import os
from pathlib import Path


def _extract_relative_from_anchor(file_path: str, image_dir: str) -> str:
    """按图片根目录名提取相对路径，兼容跨机器/跨盘符迁移。"""
    anchor = os.path.basename(os.path.normpath(image_dir))
    if not anchor:
        return ""

    parts = [
        part
        for part in os.path.normpath(file_path).replace("\\", "/").split("/")
        if part
    ]
    anchor_lower = anchor.lower()
    for index in range(len(parts) - 1, -1, -1):
        if parts[index].lower() != anchor_lower:
            continue
        rel_parts = parts[index + 1 :]
        if rel_parts:
            return "/".join(rel_parts)
        break

    return ""


def to_db_image_path(file_path: str, image_dir: str | None = None) -> str:
    """将绝对文件路径转换为相对路径，便于跨机器迁移数据库。"""
    if not file_path:
        return ""

    normalized_input = os.path.normpath(file_path)
    if not image_dir:
        return normalized_input

    normalized_dir = os.path.normpath(image_dir)
    if not os.path.isdir(normalized_dir):
        return normalized_input

    if not os.path.isabs(normalized_input):
        return normalized_input.replace("\\", "/")

    try:
        rel_path = os.path.relpath(normalized_input, normalized_dir)
        if rel_path and rel_path != "." and not rel_path.startswith(".."):
            return rel_path.replace("\\", "/")
    except ValueError:
        pass

    anchored_rel_path = _extract_relative_from_anchor(normalized_input, normalized_dir)
    if anchored_rel_path:
        return anchored_rel_path

    return normalized_input


def resolve_image_path(file_path: str, image_dir: str | None = None) -> str | None:
    """将数据库中的图片路径解析到当前机器可访问的实际文件。"""
    if not file_path:
        return None

    normalized_input = os.path.normpath(file_path)
    if os.path.isfile(normalized_input):
        return normalized_input

    if not image_dir:
        return None

    normalized_dir = os.path.normpath(image_dir)
    if not os.path.isdir(normalized_dir):
        return None

    candidate_paths = []
    candidate_paths.append(normalized_input)

    if not os.path.isabs(normalized_input):
        candidate_paths.append(os.path.join(normalized_dir, normalized_input))
    else:
        basename = os.path.basename(normalized_input)
        if basename:
            candidate_paths.append(os.path.join(normalized_dir, basename))

        rel_parts = [p for p in Path(normalized_input).parts if p not in (".", "")]
        if len(rel_parts) >= 2:
            last_parts = rel_parts[-2:]
            candidate_paths.append(os.path.join(normalized_dir, *last_parts))

    for candidate in candidate_paths:
        if os.path.isfile(candidate):
            return candidate

    return None
