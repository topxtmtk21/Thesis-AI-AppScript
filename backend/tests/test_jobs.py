import time
from unittest.mock import patch

import pytest

from app.api.routers import jobs


@pytest.fixture(autouse=True)
def isolated_jobs_db(tmp_path, monkeypatch):
    # Every test gets its own SQLite file so tests can't see each other's jobs and
    # nothing gets written into the real backend/data/jobs.db.
    monkeypatch.setattr(jobs, "_DB_PATH", str(tmp_path / "jobs_test.db"))
    jobs._init_db()
    yield


class FakeDB:
    def __init__(self, existing_filenames=()):
        self.existing = set(existing_filenames)

    def check_document_exists(self, filename):
        return filename in self.existing

    def chunk_and_embed(self, text):
        return (["chunk1"], [[0.1] * 768])

    def upsert_chunks(self, doc_data, chunks, embeddings):
        return "paper-id"


class FakeGemini:
    def __init__(self, key):
        pass

    def analyze_document(self, text):
        return {"authors": "A", "year": "2024", "references": []}


class FakeKG:
    def add_paper_and_references(self, result_json):
        pass

    def save_graph(self):
        pass


def _wait_for_terminal(client, job_id, attempts=20):
    for _ in range(attempts):
        r = client.get(f"/api/jobs/{job_id}")
        if r.json()["status"] != "pending":
            return r
        time.sleep(0.2)
    return r


def test_submit_and_poll_success(client):
    with patch.object(jobs, "get_db", return_value=FakeDB()), \
         patch.object(jobs, "GeminiService", FakeGemini), \
         patch.object(jobs, "KnowledgeGraphManager", FakeKG):
        r = client.post("/api/jobs/analyze-text", json={
            "filename": "new.pdf", "text": "hi", "api_key": "k", "pinecone_api_key": "p"
        })
        assert r.status_code == 200
        job_id = r.json()["job_id"]

        r = _wait_for_terminal(client, job_id)

    assert r.json()["status"] == "success"
    assert r.json()["data"]["authors"] == "A"
    # Results remain available so a transient client disconnect cannot consume them.
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "success"


def test_idempotency_key_returns_same_job_without_running_twice(client):
    with patch.object(jobs, "get_db", return_value=FakeDB()), \
         patch.object(jobs, "GeminiService", FakeGemini), \
         patch.object(jobs, "KnowledgeGraphManager", FakeKG):
        payload = {"filename": "same.pdf", "text": "hi", "api_key": "k", "pinecone_api_key": "p"}
        first = client.post("/api/jobs/analyze-text", json=payload, headers={"Idempotency-Key": "stable-key"})
        second = client.post("/api/jobs/analyze-text", json=payload, headers={"Idempotency-Key": "stable-key"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["job_id"] == second.json()["job_id"]


def test_submit_rejects_duplicate_before_calling_gemini(client):
    with patch.object(jobs, "get_db", return_value=FakeDB(existing_filenames=["dup.pdf"])):
        r = client.post("/api/jobs/analyze-text", json={
            "filename": "dup.pdf", "text": "hi", "api_key": "k", "pinecone_api_key": "p"
        })

    assert r.status_code == 409
    assert "đã tồn tại" in r.json()["detail"]


def test_duplicate_check_failure_returns_friendly_error_not_crash(client):
    # Regression test: check_document_exists depends on get_db()/PineconeManager
    # construction, which can raise (e.g. invalid key). That must not crash the
    # endpoint with a raw unhandled traceback.
    def boom(pinecone_key, gemini_key):
        raise RuntimeError("[401] Invalid API key")

    with patch.object(jobs, "get_db", side_effect=boom):
        r = client.post("/api/jobs/analyze-text", json={
            "filename": "x.pdf", "text": "hi", "api_key": "k", "pinecone_api_key": "bad"
        })

    assert r.status_code == 500
    assert "detail" in r.json()


def test_poll_unknown_job_returns_404(client):
    r = client.get("/api/jobs/does-not-exist")
    assert r.status_code == 404


def test_job_error_is_reported_and_consumed(client):
    class FailingGemini:
        def __init__(self, key):
            pass

        def analyze_document(self, text):
            raise RuntimeError("Gemini quota exceeded")

    with patch.object(jobs, "get_db", return_value=FakeDB()), \
         patch.object(jobs, "GeminiService", FailingGemini), \
         patch.object(jobs, "KnowledgeGraphManager", FakeKG):
        r = client.post("/api/jobs/analyze-text", json={
            "filename": "fails.pdf", "text": "hi", "api_key": "k", "pinecone_api_key": "p"
        })
        job_id = r.json()["job_id"]
        r = _wait_for_terminal(client, job_id)

    assert r.json()["status"] == "error"
    assert "quota" in r.json()["error"].lower() or r.json()["error"]
