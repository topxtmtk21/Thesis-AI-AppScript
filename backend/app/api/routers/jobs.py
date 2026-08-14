import os
import tempfile
import threading
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.api.routers.document import get_db
from app.models.schemas import AnalyzeDocumentRequest
from app.services.gemini_service import GeminiService
from app.services.graph_service import KnowledgeGraphManager
from app.utils.logger import get_logger, handle_api_error

logger = get_logger("jobs_router")

router = APIRouter()

# Hàng đợi công việc trong bộ nhớ. Apps Script không thể chờ Gemini/Pinecone xử lý
# xong trong 1 request duy nhất (giới hạn 6 phút/lần thực thi), nên endpoint submit
# trả về job_id ngay lập tức, còn việc phân tích thật sự chạy nền (BackgroundTasks).
# Apps Script sẽ dùng trigger để hỏi lại /jobs/{id} định kỳ cho tới khi có kết quả.
_jobs_lock = threading.Lock()
_jobs: Dict[str, Dict[str, Any]] = {}


def _create_job(filename: str) -> str:
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {"status": "pending", "filename": filename, "data": None, "error": None}
    return job_id


def _set_job_success(job_id: str, data: dict):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(status="success", data=data)


def _set_job_error(job_id: str, error: str):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(status="error", error=error)


def _run_analyze_text_job(job_id: str, filename: str, text: str, api_key: str, pinecone_api_key: str):
    try:
        gemini = GeminiService(api_key)
        db = get_db(pinecone_api_key, api_key)
        kg = KnowledgeGraphManager()

        result_json = gemini.analyze_document(text)

        db.add_document({
            "filename": filename,
            "text": text,
            "authors": result_json.get("authors", ""),
            "year": result_json.get("year", ""),
            "theory": result_json.get("theory", ""),
            "methodology": result_json.get("methodology", ""),
            "detailedFindings": result_json.get("detailedFindings", [])
        })

        kg.add_paper_and_references(result_json)
        kg.save_graph()

        _set_job_success(job_id, result_json)
    except Exception as e:
        logger.error(f"Error in analyze_text job {job_id} ({filename}): {e}")
        _set_job_error(job_id, handle_api_error(e, "analyze_text_job"))


def _run_analyze_pdf_job(job_id: str, filename: str, content: bytes, api_key: str, pinecone_api_key: str):
    temp_path: Optional[str] = None
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


@router.post("/jobs/analyze-text")
def submit_analyze_text_job(req: AnalyzeDocumentRequest, background_tasks: BackgroundTasks):
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
    pinecone_api_key: str = Form(...)
):
    content = await file.read()
    job_id = _create_job(file.filename)
    background_tasks.add_task(
        _run_analyze_pdf_job, job_id, file.filename, content, api_key, pinecone_api_key
    )
    return {"status": "success", "job_id": job_id}


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job không tồn tại hoặc đã được xử lý xong trước đó.")
        result = dict(job)
        # Job đã có kết quả cuối cùng (thành công hoặc lỗi) thì trả 1 lần rồi dọn khỏi bộ nhớ,
        # tránh hàng đợi phình to vô hạn theo thời gian.
        if job["status"] in ("success", "error"):
            del _jobs[job_id]
        return result
