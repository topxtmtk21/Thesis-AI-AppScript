from fastapi import APIRouter, HTTPException

from app.models.schemas import AppendSheetRowRequest
from app.services import sheets_service
from app.utils.logger import get_logger, handle_api_error

logger = get_logger("sheets_router")

router = APIRouter()


@router.post("/sheets/append-row")
def append_row(req: AppendSheetRowRequest):
    # Dùng cho Web App đứng độc lập (không có google.script.run), ví dụ luồng dán
    # NotebookLM gọi Gemini thẳng từ trình duyệt rồi cần ghi kết quả vào Sheet thật qua
    # Backend thay vì qua Apps Script.
    try:
        sheets_service.append_main_document_row(
            req.spreadsheet_id, req.source, req.method, req.filename, req.result
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error in sheets append-row: {e}")
        raise HTTPException(status_code=500, detail=handle_api_error(e, "sheets_append_row"))
