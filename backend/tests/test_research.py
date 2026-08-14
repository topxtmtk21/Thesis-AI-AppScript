from unittest.mock import patch

from app.api.routers import research


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
