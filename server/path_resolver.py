import os
from pathlib import Path


def is_path_within_directory(file_path: str, image_dir: str) -> bool:
    """Return True only when file_path is inside image_dir, even across machines or drive letters."""
    # 空参数一律视为不安全，直接拒绝
    if not file_path or not image_dir:
        return False

    # 规范化两侧路径：消除多余分隔符、`.`、以及 `..` 等，便于后续比较
    candidate = os.path.normpath(file_path)
    root = os.path.normpath(image_dir)

    # 如果 candidate 是相对路径，则以 image_dir 作为基准拼接为绝对路径
    if not os.path.isabs(candidate):
        candidate = os.path.normpath(os.path.join(root, candidate))

    # 计算 candidate 相对于 root 的相对路径
    # 当两者位于不同盘符/文件系统根时，relpath 会抛出 ValueError，此时视为不安全
    try:
        rel = os.path.relpath(candidate, root)
    except ValueError:
        return False

    # 判定规则：
    # - rel == "." 表示 candidate 就是 image_dir 本身，允许
    # - 否则要求 rel 不以 ".." 开头（未逃逸出 image_dir）且不是绝对路径
    return rel == "." or (not rel.startswith("..") and not os.path.isabs(rel))


def _extract_relative_from_anchor(file_path: str, image_dir: str) -> str:
    """按图片根目录名提取相对路径，兼容跨机器/跨盘符迁移。"""
    # 取 image_dir 最后一级目录名作为锚点（anchor）
    # 例如 image_dir = "/data/images" → anchor = "images"
    anchor = os.path.basename(os.path.normpath(image_dir))
    if not anchor:
        return ""

    # 将 file_path 规范化后按 "/" 拆分为路径段列表，过滤空串
    # 统一使用 "/" 以兼容 Windows 反斜杠路径
    parts = [
        part
        for part in os.path.normpath(file_path).replace("\\", "/").split("/")
        if part
    ]

    # 锚点名转小写，实现跨平台不区分大小写的匹配
    anchor_lower = anchor.lower()

    # 从路径末尾向前搜索，找到最后一个匹配的锚点目录名
    # 取该锚点之后的所有路径段作为相对路径返回
    for index in range(len(parts) - 1, -1, -1):
        if parts[index].lower() != anchor_lower:
            continue
        # 锚点之后的部分即为目标相对路径
        rel_parts = parts[index + 1 :]
        if rel_parts:
            return "/".join(rel_parts)
        # 若锚点就是路径最末段（无子路径），则直接结束，不返回空串
        break

    # 整个路径中未找到锚点目录名，视为无法提取
    return ""


def to_db_image_path(file_path: str, image_dir: str | None = None) -> str:
    """将绝对文件路径转换为相对路径，便于跨机器迁移数据库。"""
    # 空路径直接返回空串，避免后续处理无意义
    if not file_path:
        return ""

    # 规范化输入路径，消除冗余分隔符、"."、".." 等
    normalized_input = os.path.normpath(file_path)

    # 未提供 image_dir 时，无法确定相对路径基准，直接返回规范化后的原始路径
    if not image_dir:
        return normalized_input

    # 规范化 image_dir，与输入路径使用相同的规范化规则
    normalized_dir = os.path.normpath(image_dir)

    # 目录在文件系统中不存在时，无法计算可靠的相对路径，回退到原始路径
    if not os.path.isdir(normalized_dir):
        return normalized_input

    # 输入本身已是相对路径，无需再做转换，统一分隔符后返回
    if not os.path.isabs(normalized_input):
        return normalized_input.replace("\\", "/")

    # 尝试以 image_dir 为基准计算相对路径
    try:
        rel_path = os.path.relpath(normalized_input, normalized_dir)
        # 有效相对路径：非空、不是 "."（即非目录本身）、且未逃逸出基准目录
        if rel_path and rel_path != "." and not rel_path.startswith(".."):
            return rel_path.replace("\\", "/")
    except ValueError:
        # 跨盘符或跨文件系统根时 relpath 会抛出 ValueError，跳过此分支
        pass

    # 上述常规手段均失败时，尝试按锚点目录名提取相对路径
    # 适用于文件已迁移到不同机器/盘符但保留了目录结构的情况
    anchored_rel_path = _extract_relative_from_anchor(normalized_input, normalized_dir)
    if anchored_rel_path:
        return anchored_rel_path

    # 所有策略均未能提取出有意义的相对路径，返回规范化后的原始路径作为最终兜底
    return normalized_input


def resolve_image_path(file_path: str, image_dir: str | None = None) -> str | None:
    """将数据库中的图片路径解析到当前机器可访问的实际文件。"""
    # 空路径无法解析，直接返回 None
    if not file_path:
        return None

    # 规范化输入路径，消除冗余分隔符、"."、".." 等
    normalized_input = os.path.normpath(file_path)

    # 快捷路径：输入本身就是当前机器上已存在的文件，直接返回
    if os.path.isfile(normalized_input):
        return normalized_input

    # 未提供 image_dir 时，缺少拼接基准，无法继续解析
    if not image_dir:
        return None

    # 规范化 image_dir，与输入路径使用相同的规范化规则
    normalized_dir = os.path.normpath(image_dir)

    # 基准目录不存在时，所有候选路径都不可能在磁盘上存在，直接返回 None
    if not os.path.isdir(normalized_dir):
        return None

    # 依次收集可能命中的候选路径（按优先级排列），最后统一做文件存在性检查
    candidate_paths = []

    # 候选 1：原始输入路径本身（绝对路径即原样，相对路径相对当前工作目录）
    candidate_paths.append(normalized_input)

    if not os.path.isabs(normalized_input):
        # 相对路径：最可能的解释是相对 image_dir 存储的，以 image_dir 为基准拼接
        candidate_paths.append(os.path.join(normalized_dir, normalized_input))
    else:
        # 绝对路径：通常是旧机器/旧盘符上的路径，当前机器上已失效，
        # 需要基于"文件名可能不变"的假设重新定位
        basename = os.path.basename(normalized_input)
        if basename:
            # 候选 2：仅取文件名，直接在 image_dir 根目录下查找
            candidate_paths.append(os.path.join(normalized_dir, basename))

        # 过滤掉 "." 和空段，得到纯路径段列表（Windows 下含盘符/盘符冒号）
        rel_parts = [p for p in Path(normalized_input).parts if p not in (".", "")]
        # rel_parts[1:] 非空等价于至少有两个路径段，避免直接调用内建 len
        if rel_parts[1:]:
            # 候选 3：保留原路径的最后两级目录结构（父目录 + 文件名），
            # 适用于文件在 image_dir 下按"二级子目录/文件名"存放的常见结构
            last_parts = rel_parts[-2:]
            candidate_paths.append(os.path.join(normalized_dir, *last_parts))

    # 按候选顺序逐一检查，返回第一个在磁盘上真实存在的路径
    for candidate in candidate_paths:
        if os.path.isfile(candidate):
            return candidate

    # 所有候选路径均不存在，解析失败
    return None
