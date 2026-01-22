"""Tests for genealogy RAG query engine."""

import os
from unittest.mock import Mock, MagicMock, patch
import pytest
from src.genealogy_rag import GenealogyRAG


@pytest.fixture
def mock_indexer():
    """Create a mock genealogy indexer."""
    indexer = Mock()
    return indexer


@pytest.fixture
def mock_anthropic_client():
    """Create a mock Anthropic client."""
    client = Mock()
    return client


@pytest.fixture
def rag_with_mock_client(mock_indexer, mock_anthropic_client):
    """Create a RAG instance with mocked client."""
    with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
        with patch("src.genealogy_rag.Anthropic", return_value=mock_anthropic_client):
            rag = GenealogyRAG(mock_indexer)
            return rag


def test_initialization_with_api_key(mock_indexer):
    """Test initialization with API key."""
    with patch("src.genealogy_rag.Anthropic"):
        rag = GenealogyRAG(mock_indexer, api_key="test-key")
        assert rag.api_key == "test-key"


def test_initialization_from_env(mock_indexer):
    """Test initialization with API key from environment."""
    with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "env-key"}):
        with patch("src.genealogy_rag.Anthropic"):
            rag = GenealogyRAG(mock_indexer)
            assert rag.api_key == "env-key"


def test_initialization_no_api_key(mock_indexer):
    """Test initialization fails without API key."""
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="API key required"):
            GenealogyRAG(mock_indexer)


def test_query_with_results(rag_with_mock_client, mock_indexer, mock_anthropic_client):
    """Test querying with results."""
    # Mock search results
    mock_indexer.search.return_value = {
        "ids": [["person_1", "person_2"]],
        "documents": [
            [
                "Person: John Smith\nBorn: 1850-01-15 in Boston, MA",
                "Person: Mary Johnson\nBorn: 1855-03-22 in Philadelphia, PA",
            ]
        ],
        "metadatas": [
            [
                {"person_id": 1, "first_name": "John", "last_name": "Smith"},
                {"person_id": 2, "first_name": "Mary", "last_name": "Johnson"},
            ]
        ],
        "distances": [[0.1, 0.2]],
    }

    # Mock Claude API response
    mock_response = Mock()
    mock_response.content = [Mock(text="John Smith was born in Boston, MA in 1850.")]
    mock_response.usage = Mock(input_tokens=100, output_tokens=50)
    mock_anthropic_client.messages.create.return_value = mock_response

    # Query
    result = rag_with_mock_client.query("Who is John Smith?")

    # Assertions
    assert "answer" in result
    assert "sources" in result
    assert "usage" in result
    assert result["answer"] == "John Smith was born in Boston, MA in 1850."
    assert len(result["sources"]) == 2
    assert result["usage"]["input_tokens"] == 100
    assert result["usage"]["output_tokens"] == 50


def test_query_no_results(rag_with_mock_client, mock_indexer, mock_anthropic_client):
    """Test querying with no results."""
    # Mock empty search results
    mock_indexer.search.return_value = {
        "ids": [[]],
        "documents": [[]],
        "metadatas": [[]],
        "distances": [[]],
    }

    # Query
    result = rag_with_mock_client.query("Who is Unknown Person?")

    # Should return a message about no results
    assert "couldn't find any relevant information" in result["answer"]
    assert len(result["sources"]) == 0
    assert result["usage"] is None

    # Should not call Claude API
    mock_anthropic_client.messages.create.assert_not_called()


def test_format_context(rag_with_mock_client):
    """Test formatting context from documents."""
    documents = [
        "Person: John Smith\nBorn: 1850-01-15",
        "Person: Mary Johnson\nBorn: 1855-03-22",
    ]
    metadatas = [{"person_id": 1}, {"person_id": 2}]
    ids = ["person_1", "person_2"]

    context = rag_with_mock_client._format_context(documents, metadatas, ids)

    assert "Document 1" in context
    assert "Document 2" in context
    assert "John Smith" in context
    assert "Mary Johnson" in context


def test_format_sources(rag_with_mock_client):
    """Test formatting sources."""
    documents = ["Person: John Smith\nBorn: 1850-01-15"]
    metadatas = [{"person_id": 1, "first_name": "John"}]
    ids = ["person_1"]
    distances = [0.1]

    sources = rag_with_mock_client._format_sources(documents, metadatas, ids, distances)

    assert len(sources) == 1
    assert sources[0]["id"] == "person_1"
    assert "John Smith" in sources[0]["preview"]
    assert sources[0]["metadata"]["person_id"] == 1
    assert 0.8 < sources[0]["relevance_score"] < 1.0


def test_format_sources_long_document(rag_with_mock_client):
    """Test formatting sources with long document."""
    # Create a long document (over 200 characters)
    long_text = "Person: John Smith\n" + "A" * 300
    documents = [long_text]
    metadatas = [{"person_id": 1}]
    ids = ["person_1"]
    distances = [0.1]

    sources = rag_with_mock_client._format_sources(documents, metadatas, ids, distances)

    # Preview should be truncated
    assert len(sources[0]["preview"]) <= 203  # 200 + "..."
    assert sources[0]["preview"].endswith("...")
    assert sources[0]["full_text"] == long_text


def test_get_suggested_questions(rag_with_mock_client):
    """Test getting suggested questions."""
    questions = rag_with_mock_client.get_suggested_questions()

    assert len(questions) > 0
    assert any("person name" in q for q in questions)


def test_generate_answer_calls_api_correctly(
    rag_with_mock_client, mock_anthropic_client
):
    """Test that generate_answer calls Claude API with correct parameters."""
    # Mock response
    mock_response = Mock()
    mock_response.content = [Mock(text="Answer text")]
    mock_response.usage = Mock(input_tokens=100, output_tokens=50)
    mock_anthropic_client.messages.create.return_value = mock_response

    # Call generate_answer
    question = "Who is John Smith?"
    context = "Person: John Smith\nBorn: 1850"
    result = rag_with_mock_client._generate_answer(question, context)

    # Check API was called
    mock_anthropic_client.messages.create.assert_called_once()
    call_args = mock_anthropic_client.messages.create.call_args

    # Check parameters
    assert call_args.kwargs["model"] == "claude-sonnet-4-5-20251101"
    assert call_args.kwargs["max_tokens"] == 2000
    assert "system" in call_args.kwargs
    assert len(call_args.kwargs["messages"]) == 1
    assert question in call_args.kwargs["messages"][0]["content"]


def test_query_with_metadata_filter(
    rag_with_mock_client, mock_indexer, mock_anthropic_client
):
    """Test querying with metadata filter."""
    # Mock search results
    mock_indexer.search.return_value = {
        "ids": [["person_1"]],
        "documents": [["Person: John Smith"]],
        "metadatas": [[{"person_id": 1}]],
        "distances": [[0.1]],
    }

    # Mock Claude API response
    mock_response = Mock()
    mock_response.content = [Mock(text="Answer")]
    mock_response.usage = Mock(input_tokens=100, output_tokens=50)
    mock_anthropic_client.messages.create.return_value = mock_response

    # Query with filter
    metadata_filter = {"birth_year": 1850}
    result = rag_with_mock_client.query("Who?", metadata_filter=metadata_filter)

    # Check filter was passed to search
    call_args = mock_indexer.search.call_args
    assert call_args.kwargs["where"] == metadata_filter
