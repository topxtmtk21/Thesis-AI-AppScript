import json
import os
import sqlite3
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.api.routers.document import get_db
from app.models.schemas import AnalyzeDocumentRequest
from app.services.gemini_service import GeminiService
from app.services.graph_service import KnowledgeGraphManager
from app.services import sheets_service
from app.utils.logger import get_logger, handle_api_error

logger = get_logger("jobs_router")

router = APIRouter()

# Hàng đợi công việc, lưu ở SQLite thay vì dict trong RAM. Apps Script không thể chờ
# Gemini/Pinecone xử lý xong trong 1 request duy nhất (giới hạn 6 phút/lần thực thi),
# nên endpoint submit trả về job_id ngay lập tức, còn việc phân tích thật sự chạy nền
# (BackgroundTasks). Apps Script dùng trigger để hỏi lại /jobs/{id} định kỳ cho tới khi
# có kết quả. Dùng SQLite (thay vì dict) để trạng thái job không mất khi tiến trình
# backend bị Railway/Cloud Run khởi động lại giữa chừng.
_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), 'data')
os.makedirs(_DB_DIR, exist_ok=True)
_DB_PATH = os.path.join(_DB_DIR, 'jobs.db')

# Giới hạn số job THỰC SỰ chạy Gemini/Pinecone cùng lúc. Không giới hạn thì một lượt gửi
# 25 file (MAX_FILES trong Mã.js) sẽ bắn 25 job song song, dễ dính rate-limit 429 hàng
# loạt từ Gemini hoặc làm quá tải instance nhỏ trên Railway/Cloud Run. Job vẫn nhận vào
# hàng đợi ngay lập tức (job_id trả về tức thì) - chỉ phần xử lý nặng mới bị nghẽn cổ chai
# có kiểm soát ở đây.
_MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "3"))
_job_concurrency_gate = threading.Semaphore(_MAX_CONCURRENT_JOBS)


def _get_conn():
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db():
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                filename TEXT,
                data TEXT,
                error TEXT,
                created_at REAL NOT NULL
            )
        """)


_init_db()


def _create_job(filename: str) -> str:
    job_id = str(uuid.uuid4())
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, filename, data, error, created_at) VALUES (?, 'pending', ?, NULL, NULL, ?)",
            (job_id, filename, time.time())
        )
    return job_id


def _set_job_success(job_id: str, data: dict):
    with _get_conn() as conn:
        conn.execute(
            "UPDATE jobs SET status = 'success', data = ? WHERE id = ?",
            (json.dumps(data, ensure_ascii=False), job_id)
        )


def _set_job_error(job_id: str, error: str):
    with _get_conn() as conn:
        conn.execute("UPDATE jobs SET status = 'error', error = ? WHERE id = ?", (error, job_id))


def _run_analyze_text_job(job_id: str, filename: str, text: str, api_key: str, pinecone_api_key: str):
    # Chờ tới lượt nếu đã có _MAX_CONCURRENT_JOBS job khác đang xử lý - job vẫn ở
    # trạng thái "pending" trong lúc chờ, Apps Script poll vẫn thấy bình thường.
    with _job_concurrency_gate:
        try:
            gemini = GeminiService(api_key)
            db = get_db(pinecone_api_key, api_key)
            kg = KnowledgeGraphManager()

            # Gemini phân tích nội dung và Pinecone băm+tính embedding là 2 việc độc lập
            # (embedding chỉ cần văn bản gốc, không cần chờ kết quả Gemini) nên chạy song song
            # thay vì tuần tự để rút ngắn tổng thời gian xử lý 1 job.
            with ThreadPoolExecutor(max_workers=2) as executor:
                analyze_future = executor.submit(gemini.analyze_document, text)
                embed_future = executor.submit(db.chunk_and_embed, text)
                result_json = analyze_future.result()
                text_chunks, embeddings = embed_future.result()

            db.upsert_chunks({
                "filename": filename,
                "authors": result_json.get("authors", ""),
                "year": result_json.get("year", ""),
                "theory": result_json.get("theory", ""),
                "methodology": result_json.get("methodology", ""),
                "detailedFindings": result_json.get("detailedFindings", [])
            }, text_chunks, embeddings)

            kg.add_paper_and_references(result_json)
            kg.save_graph()

            _set_job_success(job_id, result_json)
        except Exception as e:
            logger.error(f"Error in analyze_text job {job_id} ({filename}): {e}")
            _set_job_error(job_id, handle_api_error(e, "analyze_text_job"))


def _run_analyze_pdf_job(job_id: str, filename: str, content: bytes, api_key: str, pinecone_api_key: str, spreadsheet_id: str = ""):
    temp_path: Optional[str] = None
    with _job_concurrency_gate:
        try:
            gemini = GeminiService(api_key)
            db = get_db(pinecone_api_key, api_key)
            kg = KnowledgeGraphManager()

            temp_input = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            temp_input.write(content)
            temp_input.close()
            temp_path = temp_input.name

            result_json = gemini.analyze_pdf_native(temp_path)

            db.add_document({
                "filename": filename,
                "text": "Native PDF Analysis (No raw text stored)",
                "authors": result_json.get("authors", ""),
                "year": result_json.get("year", ""),
                "theory": result_json.get("theory", ""),
                "methodology": result_json.get("methodology", "")
            })

            kg.add_paper_and_references(result_json)
            kg.save_graph()

            if spreadsheet_id:
                # Ghi vào Sheet thật (Service Account) chỉ khi Web App độc lập có cấu hình
                # Spreadsheet ID - best-effort, không phá job nếu lỗi (vd chưa share quyền).
                try:
                    sheets_service.append_main_document_row(
                        spreadsheet_id, "Web App", "Tải PDF", filename, result_json
                    )
                except Exception as e:
                    logger.error(f"Error writing PDF job result to Google Sheet: {e}")

            _set_job_success(job_id, result_json)
        except Exception as e:
            logger.error(f"Error in analyze_pdf job {job_id} ({filename}): {e}")
            _set_job_error(job_id, handle_api_error(e, "analyze_pdf_job"))
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass


def _reject_if_duplicate(filename: str, api_key: str, pinecone_api_key: str):
    # Kiểm tra trùng lặp TRƯỚC khi tạo job/gọi Gemini - tốn 1 lượt query Pinecone (nhanh,
    # rẻ) để tránh tốn hẳn 1 lượt phân tích Gemini (chậm, tốn tiền) cho tài liệu đã có.
    try:
        db = get_db(pinecone_api_key, api_key)
        is_duplicate = db.check_document_exists(filename)
    except HTTPException:
        raise
    except Exception as e:
        # Lỗi kết nối/xác thực Pinecone (vd sai key) - báo lỗi rõ ràng ngay tại đây thay vì
        # để crash với traceback thô, và thay vì âm thầm bỏ qua bước kiểm tra trùng lặp.
        logger.error(f"Error checking duplicate for {filename}: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "check_duplicate"))

    if is_duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Tài liệu '{filename}' đã tồn tại trong hệ thống. Bỏ qua để tiết kiệm chi phí."
        )


@router.post("/jobs/analyze-text")
def submit_analyze_text_job(req: AnalyzeDocumentRequest, background_tasks: BackgroundTasks):
    _reject_if_duplicate(req.filename, req.api_key, req.pinecone_api_key)
    job_id = _create_job(req.filename)
    background_tasks.add_task(
        _run_analyze_text_job, job_id, req.filename, req.text, req.api_key, req.pinecone_api_key
    )
    return {"status": "success", "job_id": job_id}


@router.post("/jobs/analyze-pdf")
async def submit_analyze_pdf_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    api_key: str = Form(...),
    pinecone_api_key: str = Form(...),
    spreadsheet_id: str = Form("")
):
    _reject_if_duplicate(file.filename, api_key, pinecone_api_key)
    content = await file.read()
    job_id = _create_job(file.filename)
    background_tasks.add_task(
        _run_analyze_pdf_job, job_id, file.filename, content, api_key, pinecone_api_key, spreadsheet_id
    )
    return {"status": "success", "job_id": job_id}


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT status, filename, data, error FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Job không tồn tại hoặc đã được xử lý xong trước đó.")

        status, filename, data, error = row
        result = {
            "status": status,
            "filename": filename,
            "data": json.loads(data) if data else None,
            "error": error
        }

        # Job đã có kết quả cuối cùng (thành công hoặc lỗi) thì trả 1 lần rồi dọn khỏi DB,
        # tránh hàng đợi phình to vô hạn theo thời gian.
        if status in ("success", "error"):
            conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))

        return result
