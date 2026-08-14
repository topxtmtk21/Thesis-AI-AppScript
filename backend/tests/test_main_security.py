from unittest.mock import patch

from starlette.testclient import TestClient

import app.main as main_module


def _app_with_secret(monkeypatch, secret):
    # Patch the module attribute directly (not os.environ + importlib.reload): reload()
    # mutates app.main's module dict in place, and verify_backend_secret's closure reads
    # BACKEND_SHARED_SECRET from that same dict at call time - so a reload here would
    # leak into every other app instance in the process (including conftest's `client`
    # fixture and every other test file), since they all share that module dict.
    # monkeypatch.setattr auto-reverts after the test, so no leakage.
    monkeypatch.setattr(main_module, "BACKEND_SHARED_SECRET", secret)
    return main_module.app


def test_no_secret_configured_allows_requests_without_header(monkeypatch):
    app = _app_with_secret(monkeypatch, None)
    client = TestClient(app)
    r = client.get("/api/documents?api_key=x&pinecone_api_key=y")
    assert r.status_code != 401


def test_secret_configured_blocks_requests_without_header(monkeypatch):
    app = _app_with_secret(monkeypatch, "mysecret")
    client = TestClient(app)
    r = client.get("/api/documents?api_key=x&pinecone_api_key=y")
    assert r.status_code == 401


def test_secret_configured_blocks_wrong_header(monkeypatch):
    app = _app_with_secret(monkeypatch, "mysecret")
    client = TestClient(app)
    r = client.get(
        "/api/documents?api_key=x&pinecone_api_key=y",
        headers={"X-Backend-Secret": "wrong"}
    )
    assert r.status_code == 401


def test_secret_configured_allows_correct_header(monkeypatch):
    app = _app_with_secret(monkeypatch, "mysecret")
    client = TestClient(app)
    r = client.get(
        "/api/documents?api_key=x&pinecone_api_key=y",
        headers={"X-Backend-Secret": "mysecret"}
    )
    assert r.status_code != 401


def test_graph_endpoint_exempt_from_secret_check(monkeypatch):
    # /api/graph is embedded via <iframe src="..."> in Apps Script, which can't
    # attach a custom header, so it must stay reachable even with the secret set.
    app = _app_with_secret(monkeypatch, "mysecret")
    client = TestClient(app)
    r = client.get("/api/graph")
    assert r.status_code != 401


def test_health_endpoint_never_requires_secret(monkeypatch):
    app = _app_with_secret(monkeypatch, "mysecret")
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200


def test_health_without_keys_only_checks_server(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"] == {"server": "ok"}


def test_health_reports_degraded_when_checks_fail(client):
    # Manually verified once against the real Gemini/Pinecone APIs with fake keys
    # (both correctly returned 401s). Mocked here so the suite stays fast and
    # doesn't depend on network/external services on every run.
    with patch.object(main_module.genai, "Client", side_effect=RuntimeError("bad gemini key")), \
         patch.object(main_module, "Pinecone", side_effect=RuntimeError("bad pinecone key")):
        r = client.get("/health?api_key=FAKE&pinecone_api_key=FAKE")

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "degraded"
    assert "error" in body["checks"]["gemini"]
    assert "error" in body["checks"]["pinecone"]


def test_health_reports_ok_when_checks_succeed(client, monkeypatch):
    from unittest.mock import MagicMock

    fake_gemini_client = MagicMock()
    fake_pinecone = MagicMock()
    with patch.object(main_module.genai, "Client", return_value=fake_gemini_client), \
         patch.object(main_module, "Pinecone", return_value=fake_pinecone):
        r = client.get("/health?api_key=OK&pinecone_api_key=OK")

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["gemini"] == "ok"
    assert body["checks"]["pinecone"] == "ok"
