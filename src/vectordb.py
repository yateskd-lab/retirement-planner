"""Vector database connection and utilities for ChromaDB."""

import os
from typing import Optional, List, Dict, Any

import chromadb
from chromadb.config import Settings


class VectorDatabase:
    """Manages ChromaDB vector database connections and operations."""

    def __init__(
        self,
        persist_directory: Optional[str] = None,
        host: Optional[str] = None,
        port: Optional[int] = None,
        use_persistent: bool = True,
    ):
        """
        Initialize ChromaDB client.

        Args:
            persist_directory: Directory for persistent storage (defaults to CHROMA_PERSIST_DIR env var or './chroma_db')
            host: ChromaDB server host (defaults to CHROMA_HOST env var, used if use_persistent=False)
            port: ChromaDB server port (defaults to CHROMA_PORT env var, used if use_persistent=False)
            use_persistent: Use persistent local storage (True) or connect to remote server (False)
        """
        self.use_persistent = use_persistent

        if use_persistent:
            self.persist_directory = persist_directory or os.getenv(
                "CHROMA_PERSIST_DIR", "./chroma_db"
            )
            self.client = chromadb.PersistentClient(path=self.persist_directory)
        else:
            self.host = host or os.getenv("CHROMA_HOST", "localhost")
            self.port = port or int(os.getenv("CHROMA_PORT", "8000"))
            self.client = chromadb.HttpClient(host=self.host, port=self.port)

    def get_or_create_collection(
        self,
        name: str,
        metadata: Optional[Dict[str, Any]] = None,
        embedding_function: Optional[Any] = None,
    ):
        """
        Get or create a collection.

        Args:
            name: Collection name
            metadata: Optional metadata for the collection
            embedding_function: Optional custom embedding function

        Returns:
            ChromaDB collection object
        """
        return self.client.get_or_create_collection(
            name=name, metadata=metadata, embedding_function=embedding_function
        )

    def get_collection(self, name: str):
        """
        Get an existing collection.

        Args:
            name: Collection name

        Returns:
            ChromaDB collection object
        """
        return self.client.get_collection(name=name)

    def delete_collection(self, name: str):
        """
        Delete a collection.

        Args:
            name: Collection name
        """
        self.client.delete_collection(name=name)

    def list_collections(self) -> List[Any]:
        """
        List all collections.

        Returns:
            List of collection objects
        """
        return self.client.list_collections()

    def add_documents(
        self,
        collection_name: str,
        documents: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ):
        """
        Add documents to a collection.

        Args:
            collection_name: Name of the collection
            documents: List of document texts
            metadatas: Optional list of metadata dicts (one per document)
            ids: Optional list of document IDs (auto-generated if not provided)

        Returns:
            None
        """
        collection = self.get_or_create_collection(collection_name)

        if ids is None:
            ids = [f"doc_{i}" for i in range(len(documents))]

        collection.add(documents=documents, metadatas=metadatas, ids=ids)

    def query_documents(
        self,
        collection_name: str,
        query_texts: List[str],
        n_results: int = 10,
        where: Optional[Dict[str, Any]] = None,
        where_document: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Query documents from a collection using semantic search.

        Args:
            collection_name: Name of the collection
            query_texts: List of query texts
            n_results: Number of results to return per query
            where: Optional metadata filter
            where_document: Optional document content filter

        Returns:
            Dictionary containing query results with ids, documents, metadatas, and distances
        """
        collection = self.get_collection(collection_name)
        return collection.query(
            query_texts=query_texts,
            n_results=n_results,
            where=where,
            where_document=where_document,
        )

    def get_documents(
        self,
        collection_name: str,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get documents from a collection.

        Args:
            collection_name: Name of the collection
            ids: Optional list of document IDs to retrieve
            where: Optional metadata filter
            limit: Optional maximum number of documents to return

        Returns:
            Dictionary containing documents with ids, documents, and metadatas
        """
        collection = self.get_collection(collection_name)
        return collection.get(ids=ids, where=where, limit=limit)

    def update_documents(
        self,
        collection_name: str,
        ids: List[str],
        documents: Optional[List[str]] = None,
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ):
        """
        Update documents in a collection.

        Args:
            collection_name: Name of the collection
            ids: List of document IDs to update
            documents: Optional list of updated document texts
            metadatas: Optional list of updated metadata dicts

        Returns:
            None
        """
        collection = self.get_collection(collection_name)
        collection.update(ids=ids, documents=documents, metadatas=metadatas)

    def delete_documents(
        self,
        collection_name: str,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
    ):
        """
        Delete documents from a collection.

        Args:
            collection_name: Name of the collection
            ids: Optional list of document IDs to delete
            where: Optional metadata filter for documents to delete

        Returns:
            None
        """
        collection = self.get_collection(collection_name)
        collection.delete(ids=ids, where=where)

    def count_documents(self, collection_name: str) -> int:
        """
        Count documents in a collection.

        Args:
            collection_name: Name of the collection

        Returns:
            Number of documents in the collection
        """
        collection = self.get_collection(collection_name)
        return collection.count()

    def reset(self):
        """Reset the database (delete all collections)."""
        self.client.reset()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        # ChromaDB clients don't need explicit cleanup
        pass
