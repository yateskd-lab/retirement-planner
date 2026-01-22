"""Extract genealogical data from PostgreSQL and format as documents for RAG."""

from typing import List, Dict, Any, Optional
from src.database import DatabaseConnection


class GenealogyExtractor:
    """
    Extract genealogical data from PostgreSQL database and format as readable documents.

    This class provides a flexible framework for extracting data from genealogy databases
    with multiple related tables. Customize the SQL queries to match your specific schema.
    """

    def __init__(self, db: DatabaseConnection):
        """
        Initialize the genealogy extractor.

        Args:
            db: DatabaseConnection instance for querying PostgreSQL
        """
        self.db = db

    def extract_all_documents(
        self, limit: Optional[int] = None, include_relationships: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Extract all person records as documents.

        Args:
            limit: Optional limit on number of persons to extract
            include_relationships: Whether to include relationship information

        Returns:
            List of dictionaries with 'id', 'text', and 'metadata' keys
        """
        # Get all persons
        persons = self._get_persons(limit)

        documents = []
        for person in persons:
            person_id = person["id"]

            # Get related data
            events = self._get_person_events(person_id) if include_relationships else []
            relationships = self._get_person_relationships(person_id) if include_relationships else []

            # Format as readable document
            doc_text = self._format_person_document(person, events, relationships)

            # Create metadata for filtering
            metadata = self._extract_metadata(person, events)

            documents.append({"id": f"person_{person_id}", "text": doc_text, "metadata": metadata})

        return documents

    def _get_persons(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Query persons table.

        CUSTOMIZE THIS METHOD for your database schema.
        This example assumes a 'persons' table with common fields.

        Args:
            limit: Optional limit on number of records

        Returns:
            List of person records as dictionaries
        """
        # Example query - CUSTOMIZE for your schema
        query = """
            SELECT
                id,
                first_name,
                middle_name,
                last_name,
                birth_date,
                birth_place,
                death_date,
                death_place,
                gender,
                occupation,
                notes
            FROM persons
            ORDER BY id
        """

        if limit:
            query += f" LIMIT {limit}"

        # Execute query
        results = self.db.execute_query(query)

        # Convert to list of dictionaries
        # CUSTOMIZE column names to match your schema
        persons = []
        for row in results:
            persons.append(
                {
                    "id": row[0],
                    "first_name": row[1],
                    "middle_name": row[2],
                    "last_name": row[3],
                    "birth_date": row[4],
                    "birth_place": row[5],
                    "death_date": row[6],
                    "death_place": row[7],
                    "gender": row[8],
                    "occupation": row[9],
                    "notes": row[10],
                }
            )

        return persons

    def _get_person_events(self, person_id: int) -> List[Dict[str, Any]]:
        """
        Query events for a specific person.

        CUSTOMIZE THIS METHOD for your database schema.
        This example assumes an 'events' table linked to persons.

        Args:
            person_id: The person's ID

        Returns:
            List of event records as dictionaries
        """
        # Example query - CUSTOMIZE for your schema
        query = """
            SELECT
                event_type,
                event_date,
                event_place,
                description
            FROM events
            WHERE person_id = %s
            ORDER BY event_date
        """

        try:
            results = self.db.execute_query(query, (person_id,))
        except Exception:
            # If events table doesn't exist or query fails, return empty list
            return []

        events = []
        for row in results:
            events.append(
                {
                    "event_type": row[0],
                    "event_date": row[1],
                    "event_place": row[2],
                    "description": row[3],
                }
            )

        return events

    def _get_person_relationships(self, person_id: int) -> List[Dict[str, Any]]:
        """
        Query relationships for a specific person.

        CUSTOMIZE THIS METHOD for your database schema.
        This example assumes a 'relationships' table with person pairs.

        Args:
            person_id: The person's ID

        Returns:
            List of relationship records as dictionaries
        """
        # Example query - CUSTOMIZE for your schema
        query = """
            SELECT
                r.relationship_type,
                p.first_name,
                p.last_name,
                p.birth_date,
                p.death_date
            FROM relationships r
            JOIN persons p ON (r.person_id_2 = p.id)
            WHERE r.person_id_1 = %s
            ORDER BY r.relationship_type
        """

        try:
            results = self.db.execute_query(query, (person_id,))
        except Exception:
            # If relationships table doesn't exist or query fails, return empty list
            return []

        relationships = []
        for row in results:
            relationships.append(
                {
                    "relationship_type": row[0],
                    "related_first_name": row[1],
                    "related_last_name": row[2],
                    "related_birth_date": row[3],
                    "related_death_date": row[4],
                }
            )

        return relationships

    def _format_person_document(
        self,
        person: Dict[str, Any],
        events: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
    ) -> str:
        """
        Format a person record as a readable text document.

        CUSTOMIZE THIS METHOD to format documents in a way that makes sense for your data.

        Args:
            person: Person record dictionary
            events: List of event dictionaries
            relationships: List of relationship dictionaries

        Returns:
            Formatted text document
        """
        # Build full name
        name_parts = [person.get("first_name"), person.get("middle_name"), person.get("last_name")]
        full_name = " ".join(filter(None, name_parts))

        # Start document with name and basic info
        doc_lines = [f"Person: {full_name}"]

        # Add gender
        if person.get("gender"):
            doc_lines.append(f"Gender: {person['gender']}")

        # Add birth information
        birth_info = []
        if person.get("birth_date"):
            birth_info.append(f"Born: {person['birth_date']}")
        if person.get("birth_place"):
            birth_info.append(f"in {person['birth_place']}")
        if birth_info:
            doc_lines.append(" ".join(birth_info))

        # Add death information
        death_info = []
        if person.get("death_date"):
            death_info.append(f"Died: {person['death_date']}")
        if person.get("death_place"):
            death_info.append(f"in {person['death_place']}")
        if death_info:
            doc_lines.append(" ".join(death_info))

        # Add occupation
        if person.get("occupation"):
            doc_lines.append(f"Occupation: {person['occupation']}")

        # Add relationships
        if relationships:
            doc_lines.append("\nRelationships:")
            for rel in relationships:
                rel_name = f"{rel.get('related_first_name', '')} {rel.get('related_last_name', '')}"
                rel_type = rel.get("relationship_type", "unknown")
                rel_dates = ""
                if rel.get("related_birth_date"):
                    rel_dates = f" (b. {rel['related_birth_date']})"
                doc_lines.append(f"  - {rel_type}: {rel_name}{rel_dates}")

        # Add events
        if events:
            doc_lines.append("\nLife Events:")
            for event in events:
                event_parts = [f"  - {event.get('event_type', 'Event')}"]
                if event.get("event_date"):
                    event_parts.append(f"on {event['event_date']}")
                if event.get("event_place"):
                    event_parts.append(f"in {event['event_place']}")
                if event.get("description"):
                    event_parts.append(f": {event['description']}")
                doc_lines.append(" ".join(event_parts))

        # Add notes
        if person.get("notes"):
            doc_lines.append(f"\nNotes: {person['notes']}")

        return "\n".join(doc_lines)

    def _extract_metadata(
        self, person: Dict[str, Any], events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Extract metadata for filtering and search.

        Args:
            person: Person record dictionary
            events: List of event dictionaries

        Returns:
            Metadata dictionary
        """
        metadata = {
            "person_id": person.get("id"),
            "last_name": person.get("last_name", ""),
            "first_name": person.get("first_name", ""),
        }

        # Add birth year if available
        if person.get("birth_date"):
            birth_date_str = str(person["birth_date"])
            # Try to extract year (handle various date formats)
            try:
                if "-" in birth_date_str:
                    year = int(birth_date_str.split("-")[0])
                elif "/" in birth_date_str:
                    year = int(birth_date_str.split("/")[-1])
                else:
                    year = int(birth_date_str[:4])
                metadata["birth_year"] = year
            except (ValueError, IndexError):
                pass

        # Add birth place if available
        if person.get("birth_place"):
            metadata["birth_place"] = person["birth_place"]

        # Add gender if available
        if person.get("gender"):
            metadata["gender"] = person["gender"]

        # Count relationships and events
        metadata["has_relationships"] = len(events) > 0 if events else False

        return metadata

    def get_sample_document(self, person_id: int) -> Optional[Dict[str, Any]]:
        """
        Extract a single person record as a sample document.

        Useful for testing and previewing document format.

        Args:
            person_id: The person's ID to extract

        Returns:
            Document dictionary or None if not found
        """
        # Get person
        query = """
            SELECT
                id,
                first_name,
                middle_name,
                last_name,
                birth_date,
                birth_place,
                death_date,
                death_place,
                gender,
                occupation,
                notes
            FROM persons
            WHERE id = %s
        """

        results = self.db.execute_query(query, (person_id,))

        if not results:
            return None

        row = results[0]
        person = {
            "id": row[0],
            "first_name": row[1],
            "middle_name": row[2],
            "last_name": row[3],
            "birth_date": row[4],
            "birth_place": row[5],
            "death_date": row[6],
            "death_place": row[7],
            "gender": row[8],
            "occupation": row[9],
            "notes": row[10],
        }

        # Get related data
        events = self._get_person_events(person_id)
        relationships = self._get_person_relationships(person_id)

        # Format document
        doc_text = self._format_person_document(person, events, relationships)
        metadata = self._extract_metadata(person, events)

        return {"id": f"person_{person_id}", "text": doc_text, "metadata": metadata}
