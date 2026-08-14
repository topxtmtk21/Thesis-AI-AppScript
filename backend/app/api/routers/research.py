from fastapi import APIRouter, HTTPException

from app.models.schemas import AnalyzeNewsRequest, CompareNewsRequest, CodeInterviewRequest
from app.services.gemini_service import GeminiService
from app.utils.logger import get_logger, handle_api_error

logger = get_logger("research_router")

router = APIRouter()


@router.post("/analyze-news")
def analyze_news(req: AnalyzeNewsRequest):
    try:
        gemini = GeminiService(req.api_key)
        result_json = gemini.analyze_news_framing(req.text, req.source_name, req.published_date)
        return {"status": "success", "data": result_json}
    except Exception as e:
        logger.error(f"Error in analyze_news: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "analyze_news"))


@router.post("/compare-news")
def compare_news(req: CompareNewsRequest):
    try:
        gemini = GeminiService(req.api_key)
        report = gemini.compare_news_framing(req.articles)
        return {"status": "success", "report": report}
    except Exception as e:
        logger.error(f"Error in compare_news: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "compare_news"))


@router.post("/code-interview")
def code_interview(req: CodeInterviewRequest):
    try:
        gemini = GeminiService(req.api_key)
        result_json = gemini.code_interview_transcript(req.transcript, req.interviewee_role)
        return {"status": "success", "data": result_json}
    except Exception as e:
        logger.error(f"Error in code_interview: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "code_interview"))
