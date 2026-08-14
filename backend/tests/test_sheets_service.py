from unittest.mock import MagicMock, patch

import pytest

from app.services import sheets_service


@pytest.fixture
def fake_service():
    service = MagicMock()
    with patch.object(sheets_service, "get_sheets_client", return_value=service):
        yield service


def test_append_row_creates_tab_when_missing(fake_service):
    fake_service.spreadsheets().get().execute.return_value = {"sheets": []}

    sheets_service.append_row("sheet123", "Phân tích Tin tức", sheets_service.NEWS_SHEET_HEADERS, ["a", "b"])

    fake_service.spreadsheets().batchUpdate.assert_called()
    update_calls = fake_service.spreadsheets().values().update.call_args_list
    assert any(
        call.kwargs["body"]["values"] == [sheets_service.NEWS_SHEET_HEADERS]
        for call in update_calls
    )
    fake_service.spreadsheets().values().append.assert_called_once()
    append_kwargs = fake_service.spreadsheets().values().append.call_args.kwargs
    assert append_kwargs["body"]["values"] == [["a", "b"]]


def test_append_row_skips_tab_creation_when_present(fake_service):
    fake_service.spreadsheets().get().execute.return_value = {
        "sheets": [{"properties": {"title": "Phân tích Tin tức"}}]
    }

    sheets_service.append_row("sheet123", "Phân tích Tin tức", sheets_service.NEWS_SHEET_HEADERS, ["a", "b"])

    fake_service.spreadsheets().batchUpdate.assert_not_called()
    fake_service.spreadsheets().values().append.assert_called_once()


def test_append_row_requires_spreadsheet_id():
    with pytest.raises(ValueError):
        sheets_service.append_row("", "Sheet1", [], [])


def test_append_news_analysis_row_maps_fields(fake_service):
    fake_service.spreadsheets().get().execute.return_value = {
        "sheets": [{"properties": {"title": sheets_service.NEWS_SHEET_NAME}}]
    }

    sheets_service.append_news_analysis_row("sheet123", "VNE", "2024-01-01", {
        "dominant_frame": "Khung xung đột", "tone": "trung lập",
        "cited_sources": ["Bộ Y tế", "WHO"], "bias_indicators": "Không rõ",
        "summary": "Tóm tắt", "theory_notes": "Agenda-Setting"
    })

    append_kwargs = fake_service.spreadsheets().values().append.call_args.kwargs
    row = append_kwargs["body"]["values"][0]
    assert row[0] == "VNE"
    assert row[1] == "2024-01-01"
    assert row[4] == "Bộ Y tế, WHO"


def test_append_interview_coding_rows_one_row_per_theme(fake_service):
    fake_service.spreadsheets().get().execute.return_value = {
        "sheets": [{"properties": {"title": sheets_service.INTERVIEW_SHEET_NAME}}]
    }

    sheets_service.append_interview_coding_rows("sheet123", "Biên tập viên", {
        "themes": [
            {"theme": "A", "description": "desc A", "supporting_quotes": ["q1"], "prevalence_note": "n1"},
            {"theme": "B", "description": "desc B", "supporting_quotes": ["q2"], "prevalence_note": "n2"},
        ]
    })

    assert fake_service.spreadsheets().values().append.call_count == 2


def test_append_main_document_row_uses_first_sheet_tab(fake_service):
    fake_service.spreadsheets().get().execute.return_value = {
        "sheets": [{"properties": {"title": "MyPapers"}}]
    }
    fake_service.spreadsheets().values().get().execute.return_value = {"values": [["Nguồn dữ liệu"]]}

    sheets_service.append_main_document_row("sheet123", "Web App", "Tải PDF", "paper.pdf", {
        "authors": "A. B", "year": "2024", "title": "Title", "journal": "J",
        "apa7": "APA", "theory": "T", "methodology": "M", "sampleSize": "100",
        "keyFindings": "KF", "researchGap": "RG", "limitations": "L",
        "detailedFindings": [{"content": "c1", "location": "tr.1"}],
        "originalQuote": "OQ", "translatedQuote": "TQ"
    })

    append_kwargs = fake_service.spreadsheets().values().append.call_args.kwargs
    assert append_kwargs["range"].startswith("MyPapers!")
    row = append_kwargs["body"]["values"][0]
    assert row[0] == "Web App"
    assert row[2] == "paper.pdf"
    assert "c1 (tr.1)" in row[14]
