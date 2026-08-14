from fastapi import APIRouter, HTTPException

from app.models.schemas import AnalyzeNewsRequest, CompareNewsRequest, CodeInterviewRequest
from app.services import research_store, sheets_service
from app.services.gemini_service import GeminiService
from app.utils.logger import get_logger, handle_api_error

logger = get_logger("research_router")

router = APIRouter()


def _try_persist(save_fn, *args):
    # Lưu trữ ở research_store.py chỉ là lớp bổ sung (để Web App độc lập vẫn tra cứu
    # lại được) - lỗi ghi DB (đĩa đầy, quyền file...) không được làm hỏng cả response
    # khi bản thân việc phân tích Gemini đã thành công.
    try:
        save_fn(*args)
    except Exception as e:
        logger.error(f"Error persisting to research_store: {e}")


def _try_write_sheet(write_fn, *args):
    # Ghi vào Google Sheet thật qua Service Account chỉ chạy khi người dùng có cấu hình
    # spreadsheet_id - best-effort giống _try_persist, không được làm hỏng response chính
    # (vd chưa share Sheet cho Service Account, hoặc chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON).
    try:
        write_fn(*args)
    except Exception as e:
        logger.error(f"Error writing to Google Sheet: {e}")


@router.post("/analyze-news")
def analyze_news(req: AnalyzeNewsRequest):
    try:
        gemini = GeminiService(req.api_key)
        result_json = gemini.analyze_news_framing(req.text, req.source_name, req.published_date)
        _try_persist(research_store.save_news_analysis, req.source_name, req.published_date, result_json)
        if req.spreadsheet_id:
            _try_write_sheet(
                sheets_service.append_news_analysis_row,
                req.spreadsheet_id, req.source_name, req.published_date, result_json
            )
        return {"status": "success", "data": result_json}
    except Exception as e:
        logger.error(f"Error in analyze_news: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "analyze_news"))


@router.post("/compare-news")
def compare_news(req: CompareNewsRequest):
    try:
        gemini = GeminiService(req.api_key)
        report = gemini.compare_news_framing(req.articles)
        sources = [a.get("source", "Không rõ") for a in req.articles]
        _try_persist(research_store.save_news_comparison, sources, report)
        return {"status": "success", "report": report}
    except Exception as e:
        logger.error(f"Error in compare_news: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "compare_news"))


@router.post("/code-interview")
def code_interview(req: CodeInterviewRequest):
    try:
        gemini = GeminiService(req.api_key)
        result_json = gemini.code_interview_transcript(req.transcript, req.interviewee_role)
        _try_persist(research_store.save_interview_coding, req.interviewee_role, result_json)
        if req.spreadsheet_id:
            _try_write_sheet(
                sheets_service.append_interview_coding_rows,
                req.spreadsheet_id, req.interviewee_role, result_json
            )
        return {"status": "success", "data": result_json}
    except Exception as e:
        logger.error(f"Error in code_interview: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "code_interview"))


@router.get("/news-analyses")
def get_news_analyses(limit: int = 50):
    return {"status": "success", "items": research_store.list_news_analyses(limit)}


@router.get("/news-comparisons")
def get_news_comparisons(limit: int = 50):
    return {"status": "success", "items": research_store.list_news_comparisons(limit)}


@router.get("/interview-codings")
def get_interview_codings(limit: int = 50):
    return {"status": "success", "items": research_store.list_interview_codings(limit)}
