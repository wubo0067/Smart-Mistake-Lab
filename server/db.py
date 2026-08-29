import sqlite3
import json
import os
from log import logger
from datetime import datetime
from path_resolver import to_db_image_path


def _now() -> str:
    """返回本地时间的 ISO 格式字符串"""
    return datetime.now().isoformat(sep=" ", timespec="seconds")


DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


def get_db():
    """
    获取数据库连接，设置 row_factory 为 sqlite3.Row 以便按列名访问"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            file_name TEXT NOT NULL,
            subject TEXT DEFAULT '',
            title TEXT DEFAULT '',
            summary TEXT DEFAULT '',
            content TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            notes TEXT DEFAULT '',
            mastery TEXT DEFAULT '',
            practice_count INTEGER DEFAULT 0,
            last_practiced_at TIMESTAMP,
            solution TEXT DEFAULT '',
            difficulty INTEGER DEFAULT 3,
            indexed_at TIMESTAMP,
            created_at TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    # 为已有数据库添加新字段（如果不存在）
    try:
        conn.execute('ALTER TABLE images ADD COLUMN notes TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE images ADD COLUMN mastery TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE images ADD COLUMN practice_count INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE images ADD COLUMN last_practiced_at TIMESTAMP")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE images ADD COLUMN solution TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE images ADD COLUMN content TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE images ADD COLUMN subject TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE images ADD COLUMN difficulty INTEGER DEFAULT 3")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute(
            "ALTER TABLE images ADD COLUMN is_focus_practice INTEGER DEFAULT 0"
        )
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE images ADD COLUMN focus_marked_at TIMESTAMP")
    except sqlite3.OperationalError:
        pass
    # 新增 practice_log 表（记录解答编辑的流水日志）
    conn.execute("""
        CREATE TABLE IF NOT EXISTS practice_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            action TEXT NOT NULL,
            created_at TIMESTAMP
        )
    """)
    # 为 practice_log 建索引
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_practice_log_date ON practice_log(created_at)"
        )
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_practice_log_file ON practice_log(file_path)"
        )
    except sqlite3.OperationalError:
        pass
    # 为 subject 建索引以加速按学科查询
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_images_subject ON images(subject)")
    except sqlite3.OperationalError:
        pass
    # 为 mastery 建索引以加速按掌握程度筛选
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_images_mastery ON images(mastery)")
    except sqlite3.OperationalError:
        pass
    # 为重点练建索引
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_focus_practice ON images(is_focus_practice)"
        )
    except sqlite3.OperationalError:
        pass
    # 修复旧数据：difficulty 为空或非法时统一设为 3
    conn.execute(
        "UPDATE images SET difficulty = 3 WHERE difficulty IS NULL OR difficulty < 1 OR difficulty > 5"
    )
    conn.commit()
    conn.close()


# --- Config ---


def get_config_value(key: str) -> str | None:
    conn = get_db()
    row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else None


def set_config_value(key: str, value: str):
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value)
    )
    conn.commit()
    conn.close()


# --- Image CRUD ---


def get_all_indexed_paths() -> set[str]:
    conn = get_db()
    rows = conn.execute("SELECT file_path FROM images").fetchall()
    conn.close()
    return {r["file_path"] for r in rows}


def _build_path_candidates(file_path: str) -> list[str]:
    candidates = []
    if not file_path:
        return candidates

    normalized = os.path.normpath(file_path)
    if normalized:
        candidates.append(normalized)
        candidates.append(normalized.replace("\\", "/"))

    image_dir = get_config_value("image_dir") or ""
    if image_dir:
        rel_path = to_db_image_path(normalized, image_dir)
        if rel_path and rel_path not in candidates:
            candidates.append(rel_path)

    return list(dict.fromkeys(candidates))


def get_image_by_path(file_path: str) -> dict | None:
    conn = get_db()
    candidates = _build_path_candidates(file_path)
    row = None
    for candidate in candidates:
        row = conn.execute(
            "SELECT * FROM images WHERE file_path = ?", (candidate,)
        ).fetchone()
        if row:
            break
    conn.close()
    if row:
        d = dict(row)
        d["tags"] = json.loads(d["tags"])
        d["solution"] = json.loads(d.get("solution") or "{}")
        return d
    return None


def get_total_image_count(
    subject: str | None = None, mastery: str | None = None
) -> int:
    """返回已索引错题总数，可按学科和掌握程度筛选"""
    conn = get_db()
    conditions = []
    params = []
    if subject:
        conditions.append("subject = ?")
        params.append(subject)
    if mastery:
        conditions.append("mastery = ?")
        params.append(mastery)
    if conditions:
        sql = "SELECT COUNT(*) FROM images WHERE " + " AND ".join(conditions)
        row = conn.execute(sql, params).fetchone()
    else:
        row = conn.execute("SELECT COUNT(*) FROM images").fetchone()
    conn.close()
    return row[0]


def get_all_subjects_from_images() -> list[str]:
    """返回数据库中已有的所有学科名"""
    conn = get_db()
    rows = conn.execute(
        'SELECT DISTINCT subject FROM images WHERE subject != "" ORDER BY subject'
    ).fetchall()
    conn.close()
    return [r["subject"] for r in rows]


def get_subject_counts() -> list[dict]:
    """返回每个学科的已索引数量，预设学科优先、未分类垫底、其余按名称排序"""
    conn = get_db()
    rows = conn.execute(
        'SELECT subject, COUNT(*) AS cnt FROM images WHERE subject != "" GROUP BY subject'
    ).fetchall()
    conn.close()

    preset_order = {"数学": 0, "物理": 1, "化学": 2, "英语": 3, "语文": 4}
    result = []
    uncategorized = None
    others = []
    for r in rows:
        entry = {"name": r["subject"], "total_count": r["cnt"]}
        if r["subject"] == "未分类":
            uncategorized = entry
        elif r["subject"] in preset_order:
            result.append((preset_order[r["subject"]], entry))
        else:
            others.append(entry)
    result.sort(key=lambda x: x[0])
    sorted_result = [entry for _, entry in result]
    others.sort(key=lambda x: x["name"])
    sorted_result.extend(others)
    if uncategorized:
        sorted_result.append(uncategorized)
    return sorted_result


def get_all_images(
    subject: str | None = None, mastery: str | None = None
) -> list[dict]:
    conn = get_db()
    conditions = []
    params = []
    if subject:
        conditions.append("subject = ?")
        params.append(subject)
    if mastery:
        conditions.append("mastery = ?")
        params.append(mastery)
    if conditions:
        sql = (
            "SELECT * FROM images WHERE "
            + " AND ".join(conditions)
            + " ORDER BY indexed_at DESC"
        )
        rows = conn.execute(sql, params).fetchall()
    else:
        rows = conn.execute("SELECT * FROM images ORDER BY indexed_at DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d["tags"])
        d["solution"] = json.loads(d.get("solution") or "{}")
        result.append(d)
    return result


def search_images(
    query: str | None = None,
    start_datetime: str | None = None,
    end_datetime: str | None = None,
    subject: str | None = None,
    mastery: str | None = None,
) -> list[dict]:
    """按关键字、日期范围、学科、掌握程度筛选错题，所有条件为 AND 关系"""
    conn = get_db()
    conditions = []
    params = []

    if subject:
        conditions.append("subject = ?")
        params.append(subject)

    if mastery:
        conditions.append("mastery = ?")
        params.append(mastery)

    if query:
        like_q = f"%{query}%"
        conditions.append(
            "(title LIKE ? OR summary LIKE ? OR content LIKE ? OR notes LIKE ? OR tags LIKE ?)"
        )
        params.extend([like_q, like_q, like_q, like_q, like_q])

    if start_datetime:
        conditions.append("created_at >= ?")
        params.append(start_datetime)

    if end_datetime:
        conditions.append("created_at <= ?")
        params.append(end_datetime)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    sql = f"SELECT * FROM images {where_clause} ORDER BY indexed_at DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d["tags"])
        d["solution"] = json.loads(d.get("solution") or "{}")
        result.append(d)
    return result


def mark_indexed(
    file_path: str,
    title: str,
    summary: str,
    content: str,
    tags: list[str],
    notes: str = "",
    mastery: str = "",
    practice_count: int = 0,
    last_practiced_at: str | None = None,
    solution: str = "",
    subject: str = "",
    difficulty: int = 3,
):
    """ 将题目标记为已索引，若已存在则更新其元数据。"""
    conn = get_db()
    storage_path = to_db_image_path(file_path, get_config_value("image_dir") or "")

    # 如果已存在记录，保留原来的 created_at
    old = conn.execute(
        "SELECT created_at FROM images WHERE file_path = ?", (storage_path,)
    ).fetchone()
    original_created_at = old["created_at"] if old else _now()

    conn.execute(
        """INSERT OR REPLACE INTO images
          (file_path, file_name, subject, title, summary, content, tags, notes, mastery, practice_count, last_practiced_at, solution, difficulty, indexed_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            storage_path,
            os.path.basename(file_path),
            subject,
            title,
            summary,
            content,
            json.dumps(tags, ensure_ascii=False),
            notes,
            mastery,
            practice_count,
            last_practiced_at,
            solution,
            difficulty,
            _now(),
            original_created_at,
        ),
    )
    conn.commit()
    conn.close()


def migrate_existing_paths_to_relative(image_dir: str | None = None) -> int:
    """将数据库中现有的绝对路径迁移为相对路径（images 与 practice_log）。"""
    conn = get_db()
    try:
        image_dir = image_dir or get_config_value("image_dir") or ""
        updated = 0

        # images 表
        rows = conn.execute("SELECT id, file_path FROM images").fetchall()
        for row in rows:
            original_path = row["file_path"] or ""
            if not original_path or not os.path.isabs(original_path):
                continue
            storage_path = to_db_image_path(original_path, image_dir)
            if storage_path == original_path:
                continue
            conn.execute(
                "UPDATE images SET file_path = ? WHERE id = ?",
                (storage_path, row["id"]),
            )
            updated += 1

        # practice_log 表：时间线依赖其与 images.file_path 的精确匹配，
        # 若不迁移，从旧机器拷贝来的日志会因路径不一致而全部被跳过
        rows = conn.execute(
            "SELECT id, file_path FROM practice_log WHERE file_path IS NOT NULL"
        ).fetchall()
        for row in rows:
            original_path = row["file_path"] or ""
            if not original_path or not os.path.isabs(original_path):
                continue
            storage_path = to_db_image_path(original_path, image_dir)
            if storage_path == original_path:
                continue
            conn.execute(
                "UPDATE practice_log SET file_path = ? WHERE id = ?",
                (storage_path, row["id"]),
            )
            updated += 1

        conn.commit()
        return updated
    finally:
        conn.close()


def update_image_meta(
    file_path: str,
    title: str | None = None,
    summary: str | None = None,
    content: str | None = None,
    tags: list[str] | None = None,
    notes: str | None = None,
    mastery: str | None = None,
    practice_count: int | None = None,
    last_practiced_at: str | None = None,
    solution: str | None = None,
    difficulty: int | None = None,
):
    conn = get_db()
    updates = []
    params = []
    image_dir = get_config_value("image_dir") or ""
    storage_path = to_db_image_path(file_path, image_dir)
    candidates = [storage_path]
    for candidate in _build_path_candidates(file_path):
        if candidate not in candidates:
            candidates.append(candidate)

    # 日志记录修改的字段和参数
    logger.info(
        f"Updating image meta for {file_path}: title={title}, summary={summary}, content={content}, tags={tags}, notes={notes}, mastery={mastery}, practice_count={practice_count}, last_practiced_at={last_practiced_at}, solution={solution}, difficulty={difficulty}"
    )
    if title is not None:
        updates.append("title = ?")
        params.append(title)
    if summary is not None:
        updates.append("summary = ?")
        params.append(summary)
    if content is not None:
        updates.append("content = ?")
        params.append(content)
    if tags is not None:
        updates.append("tags = ?")
        params.append(json.dumps(tags, ensure_ascii=False))
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)
    if mastery is not None:
        updates.append("mastery = ?")
        params.append(mastery)
    if practice_count is not None:
        updates.append("practice_count = ?")
        params.append(practice_count)
    if last_practiced_at is not None:
        updates.append("last_practiced_at = ?")
        params.append(last_practiced_at)
    if solution is not None:
        updates.append("solution = ?")
        params.append(solution)
    if difficulty is not None:
        updates.append("difficulty = ?")
        params.append(difficulty)
    if updates:
        updates.append("indexed_at = ?")
        params.append(_now())
        placeholders = ", ".join("?" for _ in candidates)
        params.extend(candidates)
        conn.execute(
            f'UPDATE images SET {", ".join(updates)} WHERE file_path IN ({placeholders})',
            params,
        )
        conn.commit()
    conn.close()


def get_focus_practice_images(subject: str | None = None) -> list[dict]:
    """返回 is_focus_practice=1 的题目，可按学科筛选，按 focus_marked_at DESC 排序"""
    conn = get_db()
    if subject:
        rows = conn.execute(
            "SELECT * FROM images WHERE is_focus_practice = 1 AND subject = ? ORDER BY focus_marked_at DESC",
            (subject,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM images WHERE is_focus_practice = 1 ORDER BY focus_marked_at DESC"
        ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d["tags"])
        d["solution"] = json.loads(d.get("solution") or "{}")
        result.append(d)
    return result


def get_focus_practice_subject_counts() -> list[dict]:
    """返回每个学科的重点练数量：[{subject, count}, ...]，按学科排序"""
    conn = get_db()
    rows = conn.execute(
        'SELECT subject, COUNT(*) AS cnt FROM images WHERE is_focus_practice = 1 AND subject != "" GROUP BY subject ORDER BY subject'
    ).fetchall()
    conn.close()
    return [{"subject": r["subject"], "count": r["cnt"]} for r in rows]


def get_focus_max_per_subject() -> int:
    """从 config 表获取每学科重点练上限，默认 5"""
    val = get_config_value("focus_max_per_subject")
    if val is not None:
        try:
            return int(val)
        except (ValueError, TypeError):
            pass
    return 5


def get_focus_practice_count() -> int:
    """返回当前重点练题目数量"""
    conn = get_db()
    row = conn.execute(
        "SELECT COUNT(*) FROM images WHERE is_focus_practice = 1"
    ).fetchone()
    conn.close()
    return row[0]


def set_focus_practice(file_path: str, enabled: bool) -> dict:
    """
    设置/取消重点练标记。
    返回：{"success": True/False, "reason": str, "count": int, "max_count": int, "subject": str}
    """
    from datetime import datetime

    conn = get_db()
    try:
        # 检查题目是否存在，同时获取 subject
        row = conn.execute(
            "SELECT is_focus_practice, subject FROM images WHERE file_path = ?",
            (file_path,),
        ).fetchone()
        if not row:
            return {
                "success": False,
                "reason": "题目不存在",
                "count": 0,
                "max_count": 5,
                "subject": "",
            }

        current = row["is_focus_practice"]
        subject = row["subject"] or "未分类"
        max_per_subject = get_focus_max_per_subject()

        if enabled:
            if current == 1:
                # 已是重点练，幂等返回
                count_row = conn.execute(
                    "SELECT COUNT(*) FROM images WHERE is_focus_practice = 1 AND subject = ?",
                    (subject,),
                ).fetchone()
                conn.close()
                return {
                    "success": True,
                    "reason": "already_set",
                    "count": count_row[0],
                    "max_count": max_per_subject,
                    "subject": subject,
                }

            # 检查该学科下的数量限制
            count_row = conn.execute(
                "SELECT COUNT(*) FROM images WHERE is_focus_practice = 1 AND subject = ?",
                (subject,),
            ).fetchone()
            if count_row[0] >= max_per_subject:
                conn.close()
                return {
                    "success": False,
                    "reason": f"{subject} 的重点练题目最多只能保留 {max_per_subject} 道",
                    "count": count_row[0],
                    "max_count": max_per_subject,
                    "subject": subject,
                }

            now_str = datetime.now().isoformat(sep=" ", timespec="seconds")
            conn.execute(
                "UPDATE images SET is_focus_practice = 1, focus_marked_at = ? WHERE file_path = ?",
                (now_str, file_path),
            )
        else:
            conn.execute(
                "UPDATE images SET is_focus_practice = 0, focus_marked_at = NULL WHERE file_path = ?",
                (file_path,),
            )

        conn.commit()
        final_count = conn.execute(
            "SELECT COUNT(*) FROM images WHERE is_focus_practice = 1 AND subject = ?",
            (subject,),
        ).fetchone()[0]
        conn.close()
        return {
            "success": True,
            "reason": "",
            "count": final_count,
            "max_count": max_per_subject,
            "subject": subject,
        }
    except Exception as e:
        conn.close()
        return {
            "success": False,
            "reason": str(e),
            "count": 0,
            "max_count": 5,
            "subject": "",
        }


def get_focus_timeout_hours() -> int:
    """从 config 表获取重点练超时阈值（小时），默认 48"""
    val = get_config_value("focus_timeout_hours")
    if val is not None:
        try:
            return int(val)
        except (ValueError, TypeError):
            pass
    return 48


def delete_image(file_path: str):
    conn = get_db()
    conn.execute("DELETE FROM images WHERE file_path = ?", (file_path,))
    conn.commit()
    conn.close()


# --- Practice Log (Timeline) ---


def log_solution_edit(file_path: str, action: str = "edit_solution"):
    """
    记录一次解答编辑日志。
    action: 'edit_solution' - 解答文字/图片变更（统一记录）
    """
    conn = get_db()
    storage_path = to_db_image_path(file_path, get_config_value("image_dir") or "")
    conn.execute(
        "INSERT INTO practice_log (file_path, action, created_at) VALUES (?, ?, ?)",
        (storage_path, action, _now()),
    )
    conn.commit()
    conn.close()


def _get_weekday_cn(date_str: str) -> str:
    """根据 YYYY-MM-DD 返回中文星期几"""
    from datetime import datetime

    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        weekdays = [
            "星期一",
            "星期二",
            "星期三",
            "星期四",
            "星期五",
            "星期六",
            "星期日",
        ]
        return weekdays[d.weekday()]
    except (ValueError, IndexError):
        return ""


def get_timeline_days(offset_days: int = 0, limit_days: int = 14) -> list[dict]:
    """
    按"天"分页，返回每个日期及其包含的练习记录条目。
    使用单 SQL JOIN 查询，避免 N+1 性能问题。
    offset_days: 跳过的天数（0 = 最新日期开始）
    limit_days: 返回的天数
    """
    conn = get_db()
    # 单 SQL JOIN 查询，一次性查出所有日志 + 图片数据
    rows = conn.execute("""
        SELECT
            date(pl.created_at) AS day,
            pl.file_path,
            COUNT(*) AS edit_count,
            MAX(pl.created_at) AS last_time,
            img.title, img.subject, img.tags, img.mastery,
            img.difficulty, img.practice_count, img.solution, img.is_focus_practice,
            img.notes, img.content, img.summary, img.created_at, img.last_practiced_at
        FROM practice_log pl
        LEFT JOIN images img ON img.file_path = pl.file_path
        GROUP BY day, pl.file_path
        ORDER BY day DESC, last_time DESC
    """).fetchall()
    conn.close()

    # Python 中按天分组
    from collections import OrderedDict

    day_map = OrderedDict()
    for r in rows:
        day_str = r["day"]
        # 跳过已被彻底删除的题目
        if r["title"] is None:
            continue
        if day_str not in day_map:
            day_map[day_str] = []
        last_time = r["last_time"]
        last_time_display = ""
        if last_time:
            try:
                from datetime import datetime as dt

                last_time_display = dt.strptime(
                    last_time, "%Y-%m-%d %H:%M:%S"
                ).strftime("%H:%M")
            except Exception:
                last_time_display = last_time
        sol_raw = r["solution"]
        sol_str = sol_raw if sol_raw else "{}"
        day_map[day_str].append(
            {
                "file_path": r["file_path"],
                "title": r["title"] or "",
                "subject": r["subject"] or "",
                "tags": (
                    json.loads(r["tags"]) if r["tags"] and r["tags"].strip() else []
                ),
                "mastery": r["mastery"] or "",
                "difficulty": r["difficulty"] or 3,
                "practice_count": r["practice_count"] or 0,
                "solution": json.loads(sol_str) if sol_str.strip() else {},
                "is_focus_practice": r["is_focus_practice"] or 0,
                "notes": r["notes"] or "",
                "content": r["content"] or "",
                "summary": r["summary"] or "",
                "created_at": r["created_at"] or "",
                "last_practiced_at": r["last_practiced_at"] or "",
                "edit_count": r["edit_count"],
                "last_time": last_time,
                "last_time_display": last_time_display,
            }
        )

    all_days = list(day_map.items())
    has_more = len(all_days) > offset_days + limit_days
    page_days = all_days[offset_days : offset_days + limit_days]

    result = []
    for day_str, items in page_days:
        result.append(
            {
                "date": day_str,
                "weekday": _get_weekday_cn(day_str),
                "count": len(items),
                "items": items,
            }
        )

    return result, has_more
