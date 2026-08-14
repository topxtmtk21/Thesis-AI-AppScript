import json
import os
import sqlite3
import time

# Lưu độc lập kết quả Phân tích Tin tức / So sánh Khung tin / Mã hoá Phỏng vấn ở Backend.
# Web App có 2 ngữ cảnh chạy: (a) qua Apps Script (có google.script.run để ghi Sheet)
# và (b) đứng độc lập do FastAPI serve tĩnh (không có Sheet). Backend lưu ở đây để ngữ
# cảnh (b) vẫn có nơi tra cứu lại kết quả - không thay thế việc ghi Sheet ở (a), chỉ là
# lớp lưu trữ bổ sung áp dụng cho mọi caller.
_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data')
os.makedirs(_DB_DIR, exist_ok=True)
_DB_PATH = os.path.join(_DB_DIR, 'research.db')


def _get_conn():
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS news_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_name TEXT,
                published_date TEXT,
                dominant_frame TEXT,
                tone TEXT,
                cited_sources TEXT,
                bias_indicators TEXT,
                summary TEXT,
                theory_notes TEXT,
                created_at REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS news_comparisons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sources TEXT,
                report TEXT,
                created_at REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS interview_codings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interviewee_role TEXT,
                themes TEXT,
                overall_summary TEXT,
                created_at REAL NOT NULL
            )
        """)


_init_db()


def save_news_analysis(source_name: str, published_date: str, result: dict):
    with _get_conn() as conn:
        conn.execute(
            """INSERT INTO news_analyses
               (source_name, published_date, dominant_frame, tone, cited_sources,
                bias_indicators, summary, theory_notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                source_name, published_date,
                result.get("dominant_frame", ""), result.get("tone", ""),
                json.dumps(result.get("cited_sources", []), ensure_ascii=False),
                result.get("bias_indicators", ""), result.get("summary", ""),
                result.get("theory_notes", ""), time.time()
            )
        )


def list_news_analyses(limit: int = 50):
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM news_analyses ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["cited_sources"] = json.loads(item["cited_sources"] or "[]")
        results.append(item)
    return results


def save_news_comparison(sources: list, report: str):
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO news_comparisons (sources, report, created_at) VALUES (?, ?, ?)",
            (json.dumps(sources, ensure_ascii=False), report, time.time())
        )


def list_news_comparisons(limit: int = 50):
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM news_comparisons ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["sources"] = json.loads(item["sources"] or "[]")
        results.append(item)
    return results


def save_interview_coding(interviewee_role: str, result: dict):
    with _get_conn() as conn:
        conn.execute(
            """INSERT INTO interview_codings (interviewee_role, themes, overall_summary, created_at)
               VALUES (?, ?, ?, ?)""",
            (
                interviewee_role,
                json.dumps(result.get("themes", []), ensure_ascii=False),
                result.get("overall_summary", ""),
                time.time()
            )
        )


def list_interview_codings(limit: int = 50):
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM interview_codings ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["themes"] = json.loads(item["themes"] or "[]")
        results.append(item)
    return results
