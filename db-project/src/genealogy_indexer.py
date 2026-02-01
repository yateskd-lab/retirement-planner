"""Index genealogical documents into ChromaDB vector database."""

from typing import List, Dict, Any, Optional
from src.vectordb import VectorDatabase


class GenealogyIndexer:
    """
    Index genealogical documents into ChromaDB for semantic search.

    This class manages the vector database collection for genealogy documents,
    providing methods to index, reindex, and query statistics.
    """

    def __init__(
        self, vdb: VectorDatabase, collection_name: str = "genealogy_documents"
    ):
        """
        Initialize the genealogy indexer.

        Args:
            vdb: VectorDatabase instance for ChromaDB operations
            collection_name: Name of the ChromaDB collection to use
        """
        self.vdb = vdb
        self.collection_name = collection_name

    def index_documents(self, documents: List[Dict[str, Any]], batch_size: int = 100) -> int:
        """
        Index documents into ChromaDB.

        Args:
            documents: List of document dictionaries with 'id', 'text', and 'metadata' keys
            batch_size: Number of documents to index at once

        Returns:
            Number of documents indexed
        """
        if not documents:
            return 0

        # Process in batches to avoid memory issues with large datasets
        total_indexed = 0

        for i in range(0, len(documents), batch_size):
            batch = documents[i : i + batch_size]

            # Extract fields for ChromaDB
            ids = [doc["id"] for doc in batch]
            texts = [doc["text"] for doc in batch]
            metadatas = [doc["metadata"] for doc in batch]

            # Add to ChromaDB
            self.vdb.add_documents(
                collection_name=self.collection_name,
                documents=texts,
                metadatas=metadatas,
                ids=ids,
            )

            total_indexed += len(batch)

        return total_indexed

    def reindex(self, documents: List[Dict[str, Any]], batch_size: int = 100) -> int:
        """
        Clear existing index and reindex all documents.

        Args:
            documents: List of document dictionaries with 'id', 'text', and 'metadata' keys
            batch_size: Number of documents to index at once

        Returns:
            Number of documents indexed
        """
        # Delete existing collection
        try:
            self.vdb.delete_collection(self.collection_name)
        except Exception:
            # Collection might not exist yet
            pass

        # Index documents
        return self.index_documents(documents, batch_size)

    def update_document(self, document: Dict[str, Any]):
        """
        Update a single document in the index.

        Args:
            document: Document dictionary with 'id', 'text', and 'metadata' keys
        """
        self.vdb.update_documents(
            collection_name=self.collection_name,
            ids=[document["id"]],
            documents=[document["text"]],
            metadatas=[document["metadata"]],
        )

    def delete_document(self, doc_id: str):
        """
        Delete a document from the index.

        Args:
            doc_id: The document ID to delete
        """
        self.vdb.delete_documents(collection_name=self.collection_name, ids=[doc_id])

    def search(
        self,
        query: str,
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Search for documents matching a query.

        Args:
            query: Search query text
            n_results: Number of results to return
            where: Optional metadata filter

        Returns:
            Dictionary with search results including ids, documents, metadatas, and distances
        """
        return self.vdb.query_documents(
            collection_name=self.collection_name,
            query_texts=[query],
            n_results=n_results,
            where=where,
        )

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a specific document by ID.

        Args:
            doc_id: The document ID

        Returns:
            Document dictionary or None if not found
        """
        results = self.vdb.get_documents(collection_name=self.collection_name, ids=[doc_id])

        if not results["ids"]:
            return None

        return {
            "id": results["ids"][0],
            "text": results["documents"][0],
            "metadata": results["metadatas"][0],
        }

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the indexed documents.

        Returns:
            Dictionary with statistics including document count
        """
        try:
            count = self.vdb.count_documents(self.collection_name)
            return {
                "collection_name": self.collection_name,
                "document_count": count,
                "status": "ready" if count > 0 else "empty",
            }
        except Exception as e:
            return {
                "collection_name": self.collection_name,
                "document_count": 0,
                "status": "not_initialized",
                "error": str(e),
            }

    def collection_exists(self) -> bool:
        """
        Check if the collection exists.

        Returns:
            True if collection exists, False otherwise
        """
        try:
            collections = self.vdb.list_collections()
            return any(c.name == self.collection_name for c in collections)
        except Exception:
            return False
