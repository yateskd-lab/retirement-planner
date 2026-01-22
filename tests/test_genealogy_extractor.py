"""Tests for genealogy data extraction."""

from unittest.mock import Mock, MagicMock
import pytest
from src.genealogy_extractor import GenealogyExtractor


@pytest.fixture
def mock_db():
    """Create a mock database connection."""
    db = Mock()
    return db


@pytest.fixture
def extractor(mock_db):
    """Create a GenealogyExtractor instance with mock database."""
    return GenealogyExtractor(mock_db)


def test_extract_all_documents(extractor, mock_db):
    """Test extracting all documents."""
    # Mock person data
    mock_db.execute_query.side_effect = [
        # First call: get persons
        [
            (
                1,
                "John",
                "Robert",
                "Smith",
                "1850-01-15",
                "Boston, MA",
                "1920-06-30",
                "New York, NY",
                "M",
                "Carpenter",
                "Immigrated from England",
            ),
            (
                2,
                "Mary",
                None,
                "Johnson",
                "1855-03-22",
                "Philadelphia, PA",
                None,
                None,
                "F",
                "Teacher",
                None,
            ),
        ],
        # Second call: events for person 1
        [
            ("Marriage", "1875-06-10", "Boston, MA", "Married Jane Doe"),
        ],
        # Third call: relationships for person 1
        [
            ("Spouse", "Jane", "Doe", "1852-04-05", "1925-12-10"),
        ],
        # Fourth call: events for person 2
        [],
        # Fifth call: relationships for person 2
        [],
    ]

    # Extract documents
    documents = extractor.extract_all_documents()

    # Assertions
    assert len(documents) == 2

    # Check first document
    doc1 = documents[0]
    assert doc1["id"] == "person_1"
    assert "John Robert Smith" in doc1["text"]
    assert "1850-01-15" in doc1["text"]
    assert "Boston, MA" in doc1["text"]
    assert "Carpenter" in doc1["text"]

    # Check metadata
    assert doc1["metadata"]["person_id"] == 1
    assert doc1["metadata"]["first_name"] == "John"
    assert doc1["metadata"]["last_name"] == "Smith"


def test_format_person_document(extractor):
    """Test formatting a person record as a document."""
    person = {
        "id": 1,
        "first_name": "John",
        "middle_name": "Robert",
        "last_name": "Smith",
        "birth_date": "1850-01-15",
        "birth_place": "Boston, MA",
        "death_date": "1920-06-30",
        "death_place": "New York, NY",
        "gender": "M",
        "occupation": "Carpenter",
        "notes": "Immigrated from England",
    }

    events = [
        {
            "event_type": "Marriage",
            "event_date": "1875-06-10",
            "event_place": "Boston, MA",
            "description": "Married Jane Doe",
        }
    ]

    relationships = [
        {
            "relationship_type": "Spouse",
            "related_first_name": "Jane",
            "related_last_name": "Doe",
            "related_birth_date": "1852-04-05",
            "related_death_date": "1925-12-10",
        }
    ]

    # Format document
    doc_text = extractor._format_person_document(person, events, relationships)

    # Assertions
    assert "John Robert Smith" in doc_text
    assert "1850-01-15" in doc_text
    assert "Boston, MA" in doc_text
    assert "Carpenter" in doc_text
    assert "Marriage" in doc_text
    assert "Jane Doe" in doc_text
    assert "Spouse" in doc_text


def test_extract_metadata(extractor):
    """Test extracting metadata from a person record."""
    person = {
        "id": 1,
        "first_name": "John",
        "last_name": "Smith",
        "birth_date": "1850-01-15",
        "birth_place": "Boston, MA",
        "gender": "M",
    }

    events = [{"event_type": "Marriage"}]

    metadata = extractor._extract_metadata(person, events)

    assert metadata["person_id"] == 1
    assert metadata["first_name"] == "John"
    assert metadata["last_name"] == "Smith"
    assert metadata["birth_year"] == 1850
    assert metadata["birth_place"] == "Boston, MA"
    assert metadata["gender"] == "M"
    assert metadata["has_relationships"] is True


def test_get_sample_document(extractor, mock_db):
    """Test getting a sample document."""
    # Mock database response
    mock_db.execute_query.side_effect = [
        # Person query
        [
            (
                1,
                "John",
                "Robert",
                "Smith",
                "1850-01-15",
                "Boston, MA",
                "1920-06-30",
                "New York, NY",
                "M",
                "Carpenter",
                "Immigrated from England",
            )
        ],
        # Events query
        [],
        # Relationships query
        [],
    ]

    # Get sample document
    doc = extractor.get_sample_document(1)

    # Assertions
    assert doc is not None
    assert doc["id"] == "person_1"
    assert "John Robert Smith" in doc["text"]
    assert doc["metadata"]["person_id"] == 1


def test_get_sample_document_not_found(extractor, mock_db):
    """Test getting a sample document that doesn't exist."""
    # Mock empty result
    mock_db.execute_query.return_value = []

    # Get sample document
    doc = extractor.get_sample_document(999)

    # Should return None
    assert doc is None
