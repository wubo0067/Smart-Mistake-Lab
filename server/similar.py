"""
Smart Mistake Lab - 相似题查找模块（纯本地粗筛）。

对“待查询的题目文本/库内题目”与题库中每一道题计算字符级相似度，输出
按相关度排序的候选列表。不依赖任何外部服务，毫秒级返回。

设计目标：
- “相同的题”（措辞几乎一致）能被召回
- “只换了数字/写法略有出入的变体题”能被召回（数字归一化）
- 涉及知识点/解题模型的语义相关题，由上层可选的 LLM 精排（server/llm.py
  的 rerank_similar_problems）进一步确认；本模块只负责把候选缩小到
  Top K，避免把整个题库喂给 LLM。

规模说明：
- 本模块读库使用 db.get_all_images()，并对“文本特征”做了基于 data.db
  文件 mtime 的内存缓存，重复搜索不会重复计算。
- 题库规模上千以后，可将 _doc_features + 打分内部替换为向量检索
  （embedding 存 SQLite），find_similar_problems 的函数签名与返回结构
  保持不变，上层（API / LLM 精排 / 前端）无需改动。
"""

import os
import re
import unicodedata

import db
from log import logger

# ============== 文本预处理 ==============

# 中文数字（基础位 1~9 与“两”）。刻意不含“十/百/千/万/亿”：
# 这些字大量出现在单位词里（千米、千克、百分数…），归一化会误伤。
_CN_DIGITS = "零一二三四五六七八九两"


def _clean_text(text: str) -> str:
    """统一全/半角、小写，剔除标点与空白，保留汉字、字母、数字。"""
    if not text:
        return ""
    # NFKC：全角数字/字母/标点 → 半角
    t = unicodedata.normalize("NFKC", text).lower()
    # 仅保留汉字、半角数字、半角小写字母
    t = re.sub(r"[^\u4e00-\u9fff0-9a-z]", "", t)
    return t


def _digit_normalize(text: str) -> str:
    """符号归一化：把变化不影响题目本质的部分折叠为占位符。

    1. 阿拉伯数字与中文数字 → '#'（合并连续），识别“只换数值”的变体；
    2. 长度 1~5 的连续英文字母（几何/函数题的顶点与线段命名，如 E、AB、
       PQRS）→ 'v'，识别“重画图但换了字母命名”的同题变体。
       * 中文题干里英文字母都是被汉字隔开的“记号”，长度几乎都 <= 5；
       * 英文整句（如英语学科题干）在去标点后是一整段连续字母，长度通常
         远超 5，不会误伤。

    例：“小明走了 3 km，求 AE 的长度”“小明走了 5 km，求 AE 的长” →
    归一化后两者高度重合，从而能识别出“只换数字”的变体题。
    """
    if not text:
        return ""
    t = re.sub(r"[0-9]+", "#", text)
    for ch in _CN_DIGITS:
        t = t.replace(ch, "#")
    t = re.sub(r"[a-z]{1,5}", "v", t)
    t = re.sub(r"#+", "#", t)
    return t


def normalize_text(text: str) -> str:
    """公开的文本归一化入口：去标点/空白/大小写差异 + 数字归一化。"""
    return _digit_normalize(_clean_text(text))


def _bigrams(text: str) -> frozenset:
    """字符二元组集合（中文无需分词；空串/单字符做退化处理）。"""
    if not text:
        return frozenset()
    if len(text) == 1:
        return frozenset([text])
    return frozenset(text[i : i + 2] for i in range(len(text) - 1))


def _set_scores(query_set: frozenset, doc_set: frozenset) -> tuple[float, float]:
    """返回 (containment, jaccard)。

    containment = |A∩B| / |A|：查询文本的“命中覆盖率”。查询文本较短时
    （如用户只贴了半句话），它比 jaccard 更能反映“题目包含这段文字”。
    jaccard = |A∩B| / |A∪B|：查询文本与题目等长（整题照抄）时更准确。
    """
    if not query_set or not doc_set:
        return 0.0, 0.0
    inter = len(query_set & doc_set)
    containment = inter / len(query_set)
    jaccard = inter / len(query_set | doc_set)
    return containment, jaccard


def _tags_iou(tags_a: list[str], tags_b: list[str]) -> float:
    """知识点标签集合的 IoU（交/并）。两个集合任一为空则视为 0。"""
    sa, sb = set(tags_a or ()), set(tags_b or ())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ============== 特征提取与缓存 ==============

# 阈值（可通过导入调整，便于测试）
SAME_THRESHOLD = 0.88      # 原始文本（含数字）几乎一致 → 同一道题
VARIANT_THRESHOLD = 0.85   # 数字归一化后几乎一致 → 换数变体
LONG_QUERY_BIGRAMS = 8     # 查询 bigram 数 >= 该值时视为“整题查询”
MIN_COMBINED_SCORE = 0.16  # 综合分低于该值的候选直接丢弃
WEAK_SCORE = 0.30          # 综合分低于该值但未丢弃 → 弱相关


def _doc_features(item: dict) -> dict:
    """为库内一道题提取用于比对的文本特征。content 为空时回退 summary/title。"""
    raw = (
        item.get("content")
        or item.get("summary")
        or item.get("title")
        or ""
    )
    clean = _clean_text(raw)
    return {
        "clean": clean,
        "norm": _digit_normalize(clean),
        "raw_bg": _bigrams(clean),
        "norm_bg": _bigrams(_digit_normalize(clean)),
        "tags": set(item.get("tags") or ()),
        "subject": item.get("subject") or "",
    }


_cache_key: object = None
_cache_items: list[tuple[dict, dict]] | None = None


def _load_items_with_features() -> list[tuple[dict, dict]]:
    """读取全库题目并提取特征（按 data.db 文件 mtime 缓存，commit 后自动失效）。"""
    global _cache_key, _cache_items
    try:
        mtime = os.path.getmtime(db.DB_PATH)
    except OSError:
        mtime = None
    if _cache_items is not None and _cache_key == mtime:
        return _cache_items

    items = db.get_all_images()
    _cache_items = [(it, _doc_features(it)) for it in items]
    _cache_key = mtime
    logger.info(f"[similar] 特征缓存已刷新：{len(_cache_items)} 道题")
    return _cache_items


# ============== 相似度评分与分类 ==============

def _classify_kind(
    raw_score: float,
    norm_score: float,
    combined: float,
    long_query: bool,
) -> str:
    """把一道候选归为 same / variant / similar / weak。"""
    if long_query:
        # 数字归一化后分数明显高于原始分（且本身足够高）→ 差异主要来自
        # 数字/字母命名 → “换数变体”。先于 same 判断：整题照抄但只改了
        # 一个数字的长题干 raw_score 可能仍 > 0.88，必须靠“归一化提升量”区分。
        if norm_score >= VARIANT_THRESHOLD and norm_score >= raw_score + 0.03:
            return "variant"
        if raw_score >= SAME_THRESHOLD:
            return "same"
        if combined >= WEAK_SCORE:
            return "similar"
        return "weak"
    # 短查询：整句/关键句几乎全部命中才算“可能同一题”，否则看综合分
    if raw_score >= 0.90:
        return "same"
    if combined >= WEAK_SCORE:
        return "similar"
    return "weak"


def find_similar_problems(
    query_text: str,
    query_tags: list[str] | None = None,
    query_subject: str = "",
    top_k: int = 15,
    exclude_file_path: str = "",
) -> list[dict]:
    """在题库中查找与 query_text 相似的题目，按相关度降序返回。

    Args:
        query_text: 查询文本（粘贴的题目文字，或库内题的 content）
        query_tags: 查询题的知识点标签（仅“库内题找同类”时提供，
            纯文本查询传 None 即可）
        query_subject: 查询题的学科（用于同科加分，可选）
        top_k: 返回候选上限（1~50）
        exclude_file_path: 需要排除的 file_path（如“详情页找相似”时
            排除它自己），可选

    Returns:
        每项为 db 中的完整题目 dict，并附加两个字段：
        - score: 0~1 综合相关度
        - match_kind: "same" | "variant" | "similar" | "weak"
    """
    top_k = max(1, min(50, int(top_k or 15)))

    q_clean = _clean_text(query_text)
    q_norm = _digit_normalize(q_clean)
    q_raw_bg = _bigrams(q_clean)
    q_norm_bg = _bigrams(q_norm)
    q_tags = set(query_tags or ())
    long_query = len(q_raw_bg) >= LONG_QUERY_BIGRAMS

    scored: list[tuple[float, str, dict]] = []
    for item, feats in _load_items_with_features():
        if exclude_file_path and item.get("file_path") == exclude_file_path:
            continue

        raw_c, raw_j = _set_scores(q_raw_bg, feats["raw_bg"])
        norm_c, norm_j = _set_scores(q_norm_bg, feats["norm_bg"])
        raw_score = 0.55 * raw_c + 0.45 * raw_j
        norm_score = 0.55 * norm_c + 0.45 * norm_j
        text_sim = max(raw_score, norm_score)

        tag_sim = _tags_iou(query_tags or [], sorted(feats["tags"]))
        subject_bonus = 0.05 if (query_subject and feats["subject"] == query_subject) else 0.0

        combined = min(1.0, 0.60 * text_sim + 0.35 * tag_sim + subject_bonus)
        if combined < MIN_COMBINED_SCORE:
            continue

        kind = _classify_kind(raw_score, norm_score, combined, long_query)
        # 存分数便于排序；文本相似度太低时“纯靠标签”的候选分也不会虚高
        scored.append((combined, kind, item, raw_score, norm_score, tag_sim))

    # 降序：分数 → 文本相似度 → 文件名，保证排序稳定
    scored.sort(key=lambda x: (x[0], x[3], x[1]), reverse=True)

    results = []
    for combined, kind, item, raw_score, norm_score, tag_sim in scored[:top_k]:
        out = dict(item)
        out["score"] = round(combined, 3)
        out["match_kind"] = kind
        results.append(out)
    return results
