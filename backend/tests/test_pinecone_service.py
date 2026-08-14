from unittest.mock import MagicMock, patch

from app.services.pinecone_service import PineconeManager


def _manager_with_mocks():
    with patch("app.services.pinecone_service.Pinecone") as MockPinecone, \
         patch("app.services.pinecone_service.genai") as mock_genai:
        MockPinecone.return_value.list_indexes.return_value.names.return_value = ["academic-papers"]
        mgr = PineconeManager("fake_pinecone_key", "fake_gemini_key")
        mgr.index = MagicMock()
        mgr.client = mock_genai.Client.return_value
        return mgr


def test_chunk_and_embed_is_independent_of_metadata():
    mgr = _manager_with_mocks()
    mgr._get_embeddings_batch = lambda texts, task_type="retrieval_document": [[0.1] * 768 for _ in texts]

    text_chunks, embeddings = mgr.chunk_and_embed("some paper text " * 50)

    assert len(text_chunks) == len(embeddings)
    assert len(text_chunks) > 0
    # No Pinecone upsert should have happened yet - chunking/embedding only.
    mgr.index.upsert.assert_not_called()


def test_upsert_chunks_writes_metadata_and_batches():
    mgr = _manager_with_mocks()
    chunks = ["chunk a", "chunk b"]
    embeddings = [[0.1] * 768, [0.2] * 768]

    paper_id = mgr.upsert_chunks(
        {"filename": "paper.pdf", "authors": "Smith", "year": "2024"},
        chunks,
        embeddings
    )

    assert paper_id
    mgr.index.upsert.assert_called_once()
    vectors = mgr.index.upsert.call_args.kwargs["vectors"]
    assert len(vectors) == 2
    assert vectors[0]["metadata"]["authors"] == "Smith"
    assert vectors[0]["metadata"]["text"] == "chunk a"


def test_add_document_wrapper_still_works_for_legacy_callers():
    # add_document() is kept as a thin wrapper around chunk_and_embed +
    # upsert_chunks for the older sync endpoints in document.py.
    mgr = _manager_with_mocks()
    mgr._get_embeddings_batch = lambda texts, task_type="retrieval_document": [[0.1] * 768 for _ in texts]

    paper_id = mgr.add_document({"filename": "paper.pdf", "text": "some content here"})

    assert paper_id
    mgr.index.upsert.assert_called_once()


def test_add_document_with_empty_text_is_a_noop():
    mgr = _manager_with_mocks()
    result = mgr.add_document({"filename": "empty.pdf", "text": ""})
    assert result is None
    mgr.index.upsert.assert_not_called()
