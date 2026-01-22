"""Example usage of the VectorDatabase class with ChromaDB."""

from dotenv import load_dotenv
from src.vectordb import VectorDatabase

# Load environment variables from .env file
load_dotenv()


def main():
    """Demonstrate ChromaDB vector database operations."""
    print("=== ChromaDB Vector Database Example ===\n")

    # Initialize ChromaDB with persistent local storage
    with VectorDatabase() as vdb:
        collection_name = "example_docs"

        # Add some sample documents
        print(f"Adding documents to collection '{collection_name}'...")
        documents = [
            "The quick brown fox jumps over the lazy dog.",
            "Python is a high-level programming language.",
            "Machine learning is a subset of artificial intelligence.",
            "ChromaDB is a vector database for AI applications.",
            "Natural language processing helps computers understand human language.",
        ]

        metadatas = [
            {"source": "animals", "category": "phrases"},
            {"source": "programming", "category": "definitions"},
            {"source": "ai", "category": "definitions"},
            {"source": "databases", "category": "definitions"},
            {"source": "ai", "category": "definitions"},
        ]

        ids = [f"doc_{i}" for i in range(len(documents))]

        vdb.add_documents(
            collection_name=collection_name, documents=documents, metadatas=metadatas, ids=ids
        )

        print(f"Added {len(documents)} documents.\n")

        # Count documents in the collection
        count = vdb.count_documents(collection_name)
        print(f"Total documents in collection: {count}\n")

        # Query the collection using semantic search
        print("Querying for 'artificial intelligence and computers'...")
        results = vdb.query_documents(
            collection_name=collection_name,
            query_texts=["artificial intelligence and computers"],
            n_results=3,
        )

        print("\nTop 3 most relevant documents:")
        for i, (doc, metadata, distance) in enumerate(
            zip(results["documents"][0], results["metadatas"][0], results["distances"][0]), 1
        ):
            print(f"{i}. {doc}")
            print(f"   Metadata: {metadata}")
            print(f"   Distance: {distance:.4f}\n")

        # Query with metadata filter
        print("Querying for AI-related documents only...")
        results = vdb.query_documents(
            collection_name=collection_name,
            query_texts=["machine learning"],
            n_results=2,
            where={"category": "definitions"},
        )

        print("\nTop 2 definition documents:")
        for i, (doc, metadata) in enumerate(
            zip(results["documents"][0], results["metadatas"][0]), 1
        ):
            print(f"{i}. {doc}")
            print(f"   Metadata: {metadata}\n")

        # Get specific documents by ID
        print("Retrieving specific documents by ID...")
        docs = vdb.get_documents(collection_name=collection_name, ids=["doc_0", "doc_3"])
        print(f"\nRetrieved {len(docs['ids'])} documents:")
        for doc_id, doc in zip(docs["ids"], docs["documents"]):
            print(f"  {doc_id}: {doc}")

        # Update a document
        print("\n\nUpdating document 'doc_0'...")
        vdb.update_documents(
            collection_name=collection_name,
            ids=["doc_0"],
            documents=["The swift brown fox leaps over the sleepy dog."],
            metadatas=[{"source": "animals", "category": "phrases", "updated": True}],
        )
        print("Document updated.")

        # Verify the update
        updated_doc = vdb.get_documents(collection_name=collection_name, ids=["doc_0"])
        print(f"Updated document: {updated_doc['documents'][0]}")
        print(f"Updated metadata: {updated_doc['metadatas'][0]}\n")

        # List all collections
        print("\nListing all collections:")
        collections = vdb.list_collections()
        for collection in collections:
            print(f"  - {collection.name}")

        # Delete a specific document
        print("\n\nDeleting document 'doc_4'...")
        vdb.delete_documents(collection_name=collection_name, ids=["doc_4"])
        count_after_delete = vdb.count_documents(collection_name)
        print(f"Documents remaining: {count_after_delete}")

        # Clean up: delete the collection
        print("\n\nCleaning up: deleting collection...")
        vdb.delete_collection(collection_name)
        print("Collection deleted successfully.")

    print("\n=== Example Complete ===")


if __name__ == "__main__":
    main()
