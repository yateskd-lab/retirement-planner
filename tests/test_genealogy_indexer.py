"""Tests for genealogy document indexing."""

from unittest.mock import Mock, MagicMock
import pytest
from src.genealogy_indexer import GenealogyIndexer


@pytest.fixture
def mock_vdb():
    """Create a mock vector database."""
    vdb = Mock()
    return vdb


@pytest.fixture
def indexer(mock_vdb):
    """Create a GenealogyIndexer instance with mock vector database."""
    return GenealogyIndexer(mock_vdb)


@pytest.fixture
def sample_documents():
    """Create sample documents for testing."""
    return [
        {
            "id": "person_1",
            "text": "Person: John Smith\nBorn: 1850-01-15 in Boston, MA",
            "metadata": {
                "person_id": 1,
                "first_name": "John",
                "last_name": "Smith",
                "birth_year": 1850,
            },
        },
        {
            "id": "person_2",
            "text": "Person: Mary Johnson\nBorn: 1855-03-22 in Philadelphia, PA",
            "metadata": {
                "person_id": 2,
                "first_name": "Mary",
                "last_name": "Johnson",
                "birth_year": 1855,
            },
        },
    ]


def test_index_documents(indexer, mock_vdb, sample_documents):
    """Test indexing documents."""
    # Index documents
    count = indexer.index_documents(sample_documents)

    # Assertions
    assert count == 2
    mock_vdb.add_documents.assert_called_once()

    # Check the call arguments
    call_args = mock_vdb.add_documents.call_args
    assert call_args.kwargs["collection_name"] == "genealogy_documents"
    assert len(call_args.kwargs["ids"]) == 2
    assert len(call_args.kwargs["documents"]) == 2
    assert len(call_args.kwargs["metadatas"]) == 2


def test_index_documents_empty(indexer, mock_vdb):
    """Test indexing empty list."""
    count = indexer.index_documents([])

    assert count == 0
    mock_vdb.add_documents.assert_not_called()


def test_index_documents_with_batching(indexer, mock_vdb):
    """Test indexing documents with batching."""
    # Create 250 documents
    documents = [
        {
            "id": f"person_{i}",
            "text": f"Person {i}",
            "metadata": {"person_id": i},
        }
        for i in range(250)
    ]

    # Index with batch size of 100
    count = indexer.index_documents(documents, batch_size=100)

    # Should make 3 calls (100, 100, 50)
    assert count == 250
    assert mock_vdb.add_documents.call_count == 3


def test_reindex(indexer, mock_vdb, sample_documents):
    """Test reindexing documents."""
    # Reindex
    count = indexer.reindex(sample_documents)

    # Should delete collection first
    mock_vdb.delete_collection.assert_called_once_with("genealogy_documents")

    # Then add documents
    assert count == 2
    mock_vdb.add_documents.assert_called_once()


def test_update_document(indexer, mock_vdb):
    """Test updating a document."""
    doc = {
        "id": "person_1",
        "text": "Updated text",
        "metadata": {"person_id": 1},
    }

    indexer.update_document(doc)

    # Check update was called
    mock_vdb.update_documents.assert_called_once()
    call_args = mock_vdb.update_documents.call_args
    assert call_args.kwargs["ids"] == ["person_1"]
    assert call_args.kwargs["documents"] == ["Updated text"]


def test_delete_document(indexer, mock_vdb):
    """Test deleting a document."""
    indexer.delete_document("person_1")

    mock_vdb.delete_documents.assert_called_once()
    call_args = mock_vdb.delete_documents.call_args
    assert call_args.kwargs["ids"] == ["person_1"]


def test_search(indexer, mock_vdb):
    """Test searching documents."""
    # Mock search results
    mock_vdb.query_documents.return_value = {
        "ids": [["person_1"]],
        "documents": [["Person: John Smith"]],
        "metadatas": [[{"person_id": 1}]],
        "distances": [[0.1]],
    }

    results = indexer.search("John Smith", n_results=5)

    # Check query was called
    mock_vdb.query_documents.assert_called_once()
    call_args = mock_vdb.query_documents.call_args
    assert call_args.kwargs["query_texts"] == ["John Smith"]
    assert call_args.kwargs["n_results"] == 5


def test_get_document(indexer, mock_vdb):
    """Test getting a document by ID."""
    # Mock result
    mock_vdb.get_documents.return_value = {
        "ids": ["person_1"],
        "documents": ["Person: John Smith"],
        "metadatas": [{"person_id": 1}],
    }

    doc = indexer.get_document("person_1")

    assert doc is not None
    assert doc["id"] == "person_1"
    assert doc["text"] == "Person: John Smith"
    assert doc["metadata"]["person_id"] == 1


def test_get_document_not_found(indexer, mock_vdb):
    """Test getting a document that doesn't exist."""
    # Mock empty result
    mock_vdb.get_documents.return_value = {
        "ids": [],
        "documents": [],
        "metadatas": [],
    }

    doc = indexer.get_document("person_999")

    assert doc is None


def test_get_stats(indexer, mock_vdb):
    """Test getting index statistics."""
    # Mock count
    mock_vdb.count_documents.return_value = 100

    stats = indexer.get_stats()

    assert stats["collection_name"] == "genealogy_documents"
    assert stats["document_count"] == 100
    assert stats["status"] == "ready"


def test_get_stats_empty(indexer, mock_vdb):
    """Test getting stats for empty index."""
    mock_vdb.count_documents.return_value = 0

    stats = indexer.get_stats()

    assert stats["document_count"] == 0
    assert stats["status"] == "empty"


def test_collection_exists(indexer, mock_vdb):
    """Test checking if collection exists."""
    # Mock collections list
    mock_collection = Mock()
    mock_collection.name = "genealogy_documents"
    mock_vdb.list_collections.return_value = [mock_collection]

    exists = indexer.collection_exists()

    assert exists is True


def test_collection_not_exists(indexer, mock_vdb):
    """Test checking if collection exists when it doesn't."""
    mock_vdb.list_collections.return_value = []

    exists = indexer.collection_exists()

    assert exists is False
