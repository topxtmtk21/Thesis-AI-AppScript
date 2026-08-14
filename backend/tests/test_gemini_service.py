from unittest.mock import MagicMock

import pytest

from app.services.gemini_service import GeminiService, _MAX_ANALYZE_TEXT_CHARS


@pytest.fixture
def gemini():
    return GeminiService("FAKE_KEY")


def _fake_response(text="{}"):
    r = MagicMock()
    r.text = text
    return r


def test_analyze_document_uses_low_thinking_and_json_mode(gemini):
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["contents"] = contents
        captured["config"] = config
        return _fake_response('{"authors": "A"}')

    gemini.client.models.generate_content = fake_generate
    result = gemini.analyze_document("some paper text")

    assert result == {"authors": "A"}
    assert captured["config"].thinking_config.thinking_level.name == "LOW"
    assert captured["config"].response_mime_type == "application/json"


def test_analyze_document_truncates_at_max_chars(gemini):
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["contents"] = contents
        return _fake_response("{}")

    gemini.client.models.generate_content = fake_generate
    marker = "AB" * 300_000  # 600,000 chars, well past the cap

    gemini.analyze_document(marker)

    assert captured["contents"].count("AB") == _MAX_ANALYZE_TEXT_CHARS // 2


def test_analyze_document_prompt_has_no_dead_fields(gemini):
    # highlight_quotes/full_bibliography used to be requested from Gemini but nothing
    # in the codebase ever reads them - pure wasted output tokens. Guard the removal.
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["contents"] = contents
        return _fake_response("{}")

    gemini.client.models.generate_content = fake_generate
    gemini.analyze_document("text")

    assert "highlight_quotes" not in captured["contents"]
    assert "full_bibliography" not in captured["contents"]
    # The JSON schema example block must render as literal JSON, not a Python
    # dict repr (regression check for the f-string brace-escaping bug).
    assert '"content": "Nội dung/Phát hiện cốt lõi số 1' in captured["contents"]
    assert "'content':" not in captured["contents"]


def test_analyze_document_handles_list_response(gemini):
    gemini.client.models.generate_content = lambda **kw: _fake_response('[{"authors": "A"}]')
    result = gemini.analyze_document("text")
    assert result == {"authors": "A"}


def test_format_raw_text_does_not_crash_on_str_format(gemini):
    # Regression test: format_raw_text's prompt uses str.format(), but the embedded
    # JSON schema wasn't brace-escaped, so every call raised KeyError before ever
    # reaching Gemini. Found and fixed during manual testing - keep it fixed.
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["contents"] = contents
        return _fake_response('{"authors": "A"}')

    gemini.client.models.generate_content = fake_generate
    result = gemini.format_raw_text("some notebooklm extract")

    assert result == {"authors": "A"}
    assert "some notebooklm extract" in captured["contents"]


def test_format_raw_text_uses_low_thinking(gemini):
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["config"] = config
        return _fake_response("{}")

    gemini.client.models.generate_content = fake_generate
    gemini.format_raw_text("text")

    assert captured["config"].thinking_config.thinking_level.name == "LOW"


def test_synthesize_literature_keeps_default_thinking(gemini):
    # Deliberately NOT lowered to "low" - literature synthesis needs deeper
    # cross-document reasoning than plain field extraction.
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["config"] = config
        return _fake_response("some report text")

    gemini.client.models.generate_content = fake_generate
    result = gemini.synthesize_literature([{"Title/Author": "A"}])

    assert result == "some report text"
    assert captured["config"] is None


def test_answer_question_uses_low_thinking(gemini):
    captured = {}

    def fake_generate(model, contents, config=None):
        captured["config"] = config
        return _fake_response("the answer")

    gemini.client.models.generate_content = fake_generate
    answer = gemini.answer_question("some prompt")

    assert answer == "the answer"
    assert captured["config"].thinking_config.thinking_level.name == "LOW"


def test_analyze_pdf_native_deletes_uploaded_file_on_success(gemini):
    calls = []

    class FakeFile:
        name = "files/abc123"

    def fake_upload(file):
        calls.append("upload")
        return FakeFile()

    def fake_delete(name):
        calls.append(("delete", name))

    def fake_generate(**kw):
        calls.append("generate")
        return _fake_response("{}")

    gemini.client.files.upload = fake_upload
    gemini.client.files.delete = fake_delete
    gemini.client.models.generate_content = fake_generate

    gemini.analyze_pdf_native("/fake/path.pdf")

    assert calls == ["upload", "generate", ("delete", "files/abc123")]


def test_analyze_pdf_native_deletes_file_on_every_retry_attempt(gemini, monkeypatch):
    # Skip tenacity's real exponential backoff (15-60s x up to 5 attempts) so this
    # test runs in milliseconds instead of minutes.
    monkeypatch.setattr("time.sleep", lambda seconds: None)

    calls = []

    class FakeFile:
        name = "files/xyz"

    gemini.client.files.upload = lambda file: (calls.append("upload"), FakeFile())[1]
    gemini.client.files.delete = lambda name: calls.append(("delete", name))

    def fail_generate(**kw):
        calls.append("generate_fail")
        raise RuntimeError("Gemini overloaded")

    gemini.client.models.generate_content = fail_generate

    with pytest.raises(RuntimeError):
        gemini.analyze_pdf_native("/fake/path.pdf")

    assert calls.count("upload") == 5  # stop_after_attempt(5)
    assert calls.count(("delete", "files/xyz")) == 5
