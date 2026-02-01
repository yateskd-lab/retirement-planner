"""Tests for the VectorDatabase class."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from src.vectordb import VectorDatabase


@pytest.fixture
def mock_chromadb_client():
    """Fixture providing a mocked ChromaDB client."""
    with patch("src.vectordb.chromadb") as mock_chroma:
        mock_client = Mock()
        mock_chroma.PersistentClient.return_value = mock_client
        mock_chroma.HttpClient.return_value = mock_client
        yield mock_client


def test_init_persistent_client(mock_chromadb_client):
    """Test VectorDatabase initialization with persistent client."""
    vdb = VectorDatabase(persist_directory="./test_db", use_persistent=True)

    assert vdb.persist_directory == "./test_db"
    assert vdb.use_persistent is True


def test_init_http_client(mock_chromadb_client):
    """Test VectorDatabase initialization with HTTP client."""
    vdb = VectorDatabase(host="localhost", port=8000, use_persistent=False)

    assert vdb.host == "localhost"
    assert vdb.port == 8000
    assert vdb.use_persistent is False


def test_init_with_env_vars(mock_chromadb_client):
    """Test VectorDatabase initialization using environment variables."""
    with patch.dict("os.environ", {"CHROMA_PERSIST_DIR": "./env_db"}):
        vdb = VectorDatabase(use_persistent=True)
        assert vdb.persist_directory == "./env_db"

    with patch.dict("os.environ", {"CHROMA_HOST": "remote.host", "CHROMA_PORT": "9000"}):
        vdb = VectorDatabase(use_persistent=False)
        assert vdb.host == "remote.host"
        assert vdb.port == 9000


def test_get_or_create_collection(mock_chromadb_client):
    """Test getting or creating a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_or_create_collection.return_value = mock_collection

    collection = vdb.get_or_create_collection("test_collection")

    assert collection == mock_collection
    mock_chromadb_client.get_or_create_collection.assert_called_once_with(
        name="test_collection", metadata=None, embedding_function=None
    )


def test_get_collection(mock_chromadb_client):
    """Test getting an existing collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection

    collection = vdb.get_collection("test_collection")

    assert collection == mock_collection
    mock_chromadb_client.get_collection.assert_called_once_with(name="test_collection")


def test_delete_collection(mock_chromadb_client):
    """Test deleting a collection."""
    vdb = VectorDatabase()

    vdb.delete_collection("test_collection")

    mock_chromadb_client.delete_collection.assert_called_once_with(name="test_collection")


def test_list_collections(mock_chromadb_client):
    """Test listing all collections."""
    vdb = VectorDatabase()
    mock_collections = [Mock(name="collection1"), Mock(name="collection2")]
    mock_chromadb_client.list_collections.return_value = mock_collections

    collections = vdb.list_collections()

    assert collections == mock_collections
    mock_chromadb_client.list_collections.assert_called_once()


def test_add_documents(mock_chromadb_client):
    """Test adding documents to a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_or_create_collection.return_value = mock_collection

    documents = ["doc1", "doc2", "doc3"]
    metadatas = [{"key": "value1"}, {"key": "value2"}, {"key": "value3"}]

    vdb.add_documents("test_collection", documents, metadatas=metadatas)

    mock_collection.add.assert_called_once()
    call_args = mock_collection.add.call_args
    assert call_args.kwargs["documents"] == documents
    assert call_args.kwargs["metadatas"] == metadatas
    assert len(call_args.kwargs["ids"]) == 3


def test_add_documents_with_custom_ids(mock_chromadb_client):
    """Test adding documents with custom IDs."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_or_create_collection.return_value = mock_collection

    documents = ["doc1", "doc2"]
    ids = ["custom_id_1", "custom_id_2"]

    vdb.add_documents("test_collection", documents, ids=ids)

    mock_collection.add.assert_called_once()
    call_args = mock_collection.add.call_args
    assert call_args.kwargs["ids"] == ids


def test_query_documents(mock_chromadb_client):
    """Test querying documents from a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection

    mock_results = {
        "ids": [["id1", "id2"]],
        "documents": [["doc1", "doc2"]],
        "metadatas": [[{"key": "value1"}, {"key": "value2"}]],
        "distances": [[0.1, 0.2]],
    }
    mock_collection.query.return_value = mock_results

    results = vdb.query_documents("test_collection", ["query text"], n_results=2)

    assert results == mock_results
    mock_collection.query.assert_called_once_with(
        query_texts=["query text"], n_results=2, where=None, where_document=None
    )


def test_query_documents_with_filters(mock_chromadb_client):
    """Test querying documents with metadata and document filters."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection
    mock_collection.query.return_value = {"ids": [[]], "documents": [[]], "metadatas": [[]]}

    where = {"category": "test"}
    where_document = {"$contains": "keyword"}

    vdb.query_documents(
        "test_collection", ["query"], n_results=5, where=where, where_document=where_document
    )

    mock_collection.query.assert_called_once_with(
        query_texts=["query"], n_results=5, where=where, where_document=where_document
    )


def test_get_documents(mock_chromadb_client):
    """Test getting documents from a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection

    mock_docs = {
        "ids": ["id1", "id2"],
        "documents": ["doc1", "doc2"],
        "metadatas": [{"key": "value1"}, {"key": "value2"}],
    }
    mock_collection.get.return_value = mock_docs

    docs = vdb.get_documents("test_collection", ids=["id1", "id2"])

    assert docs == mock_docs
    mock_collection.get.assert_called_once_with(ids=["id1", "id2"], where=None, limit=None)


def test_update_documents(mock_chromadb_client):
    """Test updating documents in a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection

    ids = ["id1", "id2"]
    documents = ["updated_doc1", "updated_doc2"]
    metadatas = [{"updated": True}, {"updated": True}]

    vdb.update_documents("test_collection", ids, documents=documents, metadatas=metadatas)

    mock_collection.update.assert_called_once_with(
        ids=ids, documents=documents, metadatas=metadatas
    )


def test_delete_documents(mock_chromadb_client):
    """Test deleting documents from a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection

    vdb.delete_documents("test_collection", ids=["id1", "id2"])

    mock_collection.delete.assert_called_once_with(ids=["id1", "id2"], where=None)


def test_delete_documents_with_filter(mock_chromadb_client):
    """Test deleting documents using metadata filter."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection

    where = {"category": "obsolete"}

    vdb.delete_documents("test_collection", where=where)

    mock_collection.delete.assert_called_once_with(ids=None, where=where)


def test_count_documents(mock_chromadb_client):
    """Test counting documents in a collection."""
    vdb = VectorDatabase()
    mock_collection = Mock()
    mock_chromadb_client.get_collection.return_value = mock_collection
    mock_collection.count.return_value = 42

    count = vdb.count_documents("test_collection")

    assert count == 42
    mock_collection.count.assert_called_once()


def test_reset(mock_chromadb_client):
    """Test resetting the database."""
    vdb = VectorDatabase()

    vdb.reset()

    mock_chromadb_client.reset.assert_called_once()


def test_context_manager(mock_chromadb_client):
    """Test VectorDatabase as a context manager."""
    with VectorDatabase() as vdb:
        assert vdb is not None
        assert vdb.client is not None
