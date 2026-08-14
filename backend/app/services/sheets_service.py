import json
import os

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

# Web App đứng độc lập (không qua Apps Script) không có google.script.run nên không thể
# ghi vào Sheet như luồng cũ. Đây là đường ghi thay thế: dùng Service Account (không cần
# tương tác người dùng, phù hợp server headless) thay vì InstalledAppFlow trong
# google_auth.py (flow đó cần mở trình duyệt cục bộ, không chạy được trên Railway/Cloud
# Run). Người dùng phải tự tạo Service Account, dán JSON key vào biến môi trường
# GOOGLE_SERVICE_ACCOUNT_JSON, và share Google Sheet đích cho email Service Account.
_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Header khớp NGUYÊN VĂN với các sheet tab mà Mã.js tạo (setupSheet() cho bảng chính,
# getOrCreateSheet() cho "Phân tích Tin tức" / "Mã hoá Phỏng vấn") - không tự bịa cột mới.
MAIN_SHEET_HEADERS = [
    "Nguồn dữ liệu", "Phương thức", "File đính kèm (PDF)", "Tác giả", "Năm xuất bản",
    "Tựa đề bài báo", "Tạp chí/Hội nghị", "Trích dẫn APA 7th", "Khung lý thuyết",
    "Phương pháp nghiên cứu", "Cỡ mẫu (Sample)", "Kết quả chính",
    "Khoảng trống nghiên cứu (Research Gap)", "Hạn chế (Limitations)",
    "Phát hiện chuyên sâu", "Trích dẫn gốc (Tiếng Anh)", "Bản dịch Tiếng Việt"
]
NEWS_SHEET_NAME = "Phân tích Tin tức"
NEWS_SHEET_HEADERS = [
    "Nguồn/Tòa soạn", "Ngày đăng", "Khung chủ đạo", "Giọng điệu",
    "Nguồn trích dẫn", "Dấu hiệu thiên kiến", "Tóm tắt", "Ghi chú lý thuyết"
]
INTERVIEW_SHEET_NAME = "Mã hoá Phỏng vấn"
INTERVIEW_SHEET_HEADERS = [
    "Người phỏng vấn/Vai trò", "Chủ đề", "Mô tả", "Trích dẫn minh hoạ", "Ghi chú tần suất"
]


def is_configured() -> bool:
    return bool(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"))


def get_sheets_client():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise RuntimeError("Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON trên Backend.")
    info = json.loads(raw)
    creds = Credentials.from_service_account_info(info, scopes=_SCOPES)
    return build("sheets", "v4", credentials=creds)


def _ensure_sheet_tab(service, spreadsheet_id: str, sheet_name: str, headers: list):
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    existing_titles = [s["properties"]["title"] for s in meta.get("sheets", [])]
    if sheet_name in existing_titles:
        return
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": sheet_name}}}]}
    ).execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1",
        valueInputOption="RAW",
        body={"values": [headers]}
    ).execute()


def append_row(spreadsheet_id: str, sheet_name: str, headers: list, row_values: list):
    if not spreadsheet_id:
        raise ValueError("Thiếu spreadsheet_id.")
    service = get_sheets_client()
    _ensure_sheet_tab(service, spreadsheet_id, sheet_name, headers)
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row_values]}
    ).execute()


def _format_detailed_findings(items) -> str:
    if not items:
        return ""
    parts = []
    for it in items:
        if isinstance(it, dict):
            content = it.get("content", "")
            location = it.get("location", "")
            parts.append(f"{content} ({location})" if location else content)
        else:
            parts.append(str(it))
    return "\n".join(parts)


def _get_first_sheet_name(service, spreadsheet_id: str) -> str:
    # Bảng 17 cột chính do setupSheet() (Mã.js) tạo trên tab ĐANG MỞ khi người dùng bấm
    # menu - không có tên cố định. Backend không biết người dùng đang mở tab nào nên
    # coi tab đầu tiên của Spreadsheet là tab chính (đúng với cách hầu hết người dùng tạo
    # 1 Sheet mới rồi chạy "Khởi tạo Bảng dữ liệu" ngay trên tab mặc định).
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = meta.get("sheets", [])
    if not sheets:
        raise RuntimeError("Spreadsheet không có tab nào.")
    return sheets[0]["properties"]["title"]


def append_main_document_row(spreadsheet_id: str, source: str, method: str, filename: str, result: dict):
    service = get_sheets_client()
    sheet_name = _get_first_sheet_name(service, spreadsheet_id)
    row = [
        source, method, filename,
        result.get("authors", ""), result.get("year", ""), result.get("title", ""),
        result.get("journal", ""), result.get("apa7", ""), result.get("theory", ""),
        result.get("methodology", ""), result.get("sampleSize", ""), result.get("keyFindings", ""),
        result.get("researchGap", ""), result.get("limitations", ""),
        _format_detailed_findings(result.get("detailedFindings")),
        result.get("originalQuote", ""), result.get("translatedQuote", "")
    ]
    _ensure_header_if_empty(service, spreadsheet_id, sheet_name, MAIN_SHEET_HEADERS)
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]}
    ).execute()


def _ensure_header_if_empty(service, spreadsheet_id: str, sheet_name: str, headers: list):
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id, range=f"{sheet_name}!A1:A1"
    ).execute()
    if not result.get("values"):
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1",
            valueInputOption="RAW",
            body={"values": [headers]}
        ).execute()


def append_news_analysis_row(spreadsheet_id: str, source_name: str, published_date: str, result: dict):
    cited_sources = result.get("cited_sources", [])
    if isinstance(cited_sources, list):
        cited_sources = ", ".join(cited_sources)
    row = [
        source_name, published_date, result.get("dominant_frame", ""), result.get("tone", ""),
        cited_sources, result.get("bias_indicators", ""), result.get("summary", ""),
        result.get("theory_notes", "")
    ]
    append_row(spreadsheet_id, NEWS_SHEET_NAME, NEWS_SHEET_HEADERS, row)


def append_interview_coding_rows(spreadsheet_id: str, interviewee_role: str, result: dict):
    for theme in result.get("themes", []):
        quotes = theme.get("supporting_quotes", [])
        if isinstance(quotes, list):
            quotes = " | ".join(quotes)
        row = [
            interviewee_role, theme.get("theme", ""), theme.get("description", ""),
            quotes, theme.get("prevalence_note", "")
        ]
        append_row(spreadsheet_id, INTERVIEW_SHEET_NAME, INTERVIEW_SHEET_HEADERS, row)
