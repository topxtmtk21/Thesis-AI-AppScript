from unittest.mock import patch

import pytest

from app.api.routers import research
from app.services import research_store


@pytest.fixture(autouse=True)
def isolated_research_db(tmp_path, monkeypatch):
    # Every test gets its own SQLite file so tests can't see each other's rows and
    # nothing gets written into the real backend/data/research.db.
    monkeypatch.setattr(research_store, "_DB_PATH", str(tmp_path / "research_test.db"))
    research_store._init_db()
    yield


class FakeGemini:
    def __init__(self, key):
        pass

    def analyze_news_framing(self, text, source_name, published_date):
        return {
            "dominant_frame": "Khung xung đột",
            "tone": "trung lập",
            "cited_sources": ["Bộ Y tế"],
            "bias_indicators": "Không rõ ràng",
            "summary": "Tóm tắt",
            "theory_notes": "Agenda-Setting"
        }

    def compare_news_framing(self, articles):
        assert len(articles) >= 2
        return "Báo cáo so sánh khung tin"

    def code_interview_transcript(self, transcript, interviewee_role):
        return {
            "themes": [
                {
                    "theme": "Niềm tin vào AI",
                    "description": "Mô tả",
                    "supporting_quotes": ["Trích dẫn 1"],
                    "prevalence_note": "Xuất hiện nhiều lần"
                }
            ],
            "overall_summary": "Tóm tắt tổng quan"
        }


def test_analyze_news_endpoint(client):
    with patch.object(research, "GeminiService", FakeGemini):
        r = client.post("/api/analyze-news", json={
            "api_key": "k", "text": "noi dung bai bao", "source_name": "VNE", "published_date": "2024-01-01"
        })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["data"]["dominant_frame"] == "Khung xung đột"


def test_compare_news_endpoint(client):
    with patch.object(research, "GeminiService", FakeGemini):
        r = client.post("/api/compare-news", json={
            "api_key": "k",
            "articles": [{"source": "A", "text": "noi dung A"}, {"source": "B", "text": "noi dung B"}]
        })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["report"] == "Báo cáo so sánh khung tin"


def test_code_interview_endpoint(client):
    with patch.object(research, "GeminiService", FakeGemini):
        r = client.post("/api/code-interview", json={
            "api_key": "k", "transcript": "noi dung phong van", "interviewee_role": "Biên tập viên"
        })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert len(body["data"]["themes"]) == 1
    assert body["data"]["themes"][0]["theme"] == "Niềm tin vào AI"


def test_endpoints_surface_gemini_errors_gracefully(client):
    class FailingGemini:
        def __init__(self, key):
            pass

        def analyze_news_framing(self, *a, **kw):
            raise RuntimeError("Gemini quota exceeded")

    with patch.object(research, "GeminiService", FailingGemini):
        r = client.post("/api/analyze-news", json={"api_key": "k", "text": "x"})

    assert r.status_code == 500
    assert "detail" in r.json()


def test_analyze_news_persists_and_is_listable(client):
    with patch.object(research, "GeminiService", FakeGemini):
        client.post("/api/analyze-news", json={
            "api_key": "k", "text": "x", "source_name": "VNE", "published_date": "2024-01-01"
        })

    r = client.get("/api/news-analyses")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["source_name"] == "VNE"
    assert items[0]["cited_sources"] == ["Bộ Y tế"]


def test_compare_news_persists_and_is_listable(client):
    with patch.object(research, "GeminiService", FakeGemini):
        client.post("/api/compare-news", json={
            "api_key": "k",
            "articles": [{"source": "Báo A", "text": "x"}, {"source": "Báo B", "text": "y"}]
        })

    r = client.get("/api/news-comparisons")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["sources"] == ["Báo A", "Báo B"]
    assert items[0]["report"] == "Báo cáo so sánh khung tin"


def test_code_interview_persists_and_is_listable(client):
    with patch.object(research, "GeminiService", FakeGemini):
        client.post("/api/code-interview", json={
            "api_key": "k", "transcript": "x", "interviewee_role": "Biên tập viên"
        })

    r = client.get("/api/interview-codings")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["interviewee_role"] == "Biên tập viên"
    assert items[0]["themes"][0]["theme"] == "Niềm tin vào AI"


def test_list_endpoints_start_empty(client):
    assert client.get("/api/news-analyses").json()["items"] == []
    assert client.get("/api/news-comparisons").json()["items"] == []
    assert client.get("/api/interview-codings").json()["items"] == []


def test_persistence_failure_does_not_break_successful_response(client):
    # research_store is a supplementary layer - if saving fails (disk full,
    # permission error...), the caller should still get their Gemini result back.
    with patch.object(research, "GeminiService", FakeGemini), \
         patch.object(research_store, "save_news_analysis", side_effect=RuntimeError("disk full")):
        r = client.post("/api/analyze-news", json={"api_key": "k", "text": "x", "source_name": "VNE"})

    assert r.status_code == 200
    assert r.json()["status"] == "success"


def test_analyze_news_writes_to_sheet_when_spreadsheet_id_given(client):
    from app.services import sheets_service

    with patch.object(research, "GeminiService", FakeGemini), \
         patch.object(sheets_service, "append_news_analysis_row") as mock_append:
        r = client.post("/api/analyze-news", json={
            "api_key": "k", "text": "x", "source_name": "VNE", "published_date": "2024-01-01",
            "spreadsheet_id": "sheet123"
        })

    assert r.status_code == 200
    mock_append.assert_called_once()
    assert mock_append.call_args[0][0] == "sheet123"


def test_analyze_news_skips_sheet_write_without_spreadsheet_id(client):
    from app.services import sheets_service

    with patch.object(research, "GeminiService", FakeGemini), \
         patch.object(sheets_service, "append_news_analysis_row") as mock_append:
        r = client.post("/api/analyze-news", json={"api_key": "k", "text": "x", "source_name": "VNE"})

    assert r.status_code == 200
    mock_append.assert_not_called()


def test_sheet_write_failure_does_not_break_successful_response(client):
    # Writing to the real Google Sheet is best-effort (missing Service Account share,
    # bad spreadsheet_id...) - it must never fail the parent request.
    from app.services import sheets_service

    with patch.object(research, "GeminiService", FakeGemini), \
         patch.object(sheets_service, "append_interview_coding_rows", side_effect=RuntimeError("403 Forbidden")):
        r = client.post("/api/code-interview", json={
            "api_key": "k", "transcript": "x", "interviewee_role": "Biên tập viên", "spreadsheet_id": "sheet123"
        })

    assert r.status_code == 200
    assert r.json()["status"] == "success"
