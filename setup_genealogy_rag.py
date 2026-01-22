"""Setup script to extract genealogy data and build the RAG index."""

import sys
from dotenv import load_dotenv
from src.database import DatabaseConnection
from src.vectordb import VectorDatabase
from src.genealogy_extractor import GenealogyExtractor
from src.genealogy_indexer import GenealogyIndexer


def print_separator():
    """Print a visual separator."""
    print("\n" + "=" * 80 + "\n")


def main():
    """Run the setup process."""
    print("=" * 80)
    print("GENEALOGY RAG SETUP")
    print("=" * 80)
    print("\nThis script will:")
    print("  1. Connect to your PostgreSQL database")
    print("  2. Extract person records and related data")
    print("  3. Index documents into ChromaDB")
    print("  4. Prepare the system for queries")
    print_separator()

    # Load environment variables
    print("Loading configuration...")
    load_dotenv()

    try:
        # Step 1: Connect to database
        print("\n[1/4] Connecting to PostgreSQL database...")
        db = DatabaseConnection()
        print("✓ Database connection established")

        # Step 2: Extract documents
        print("\n[2/4] Extracting genealogy documents from database...")
        extractor = GenealogyExtractor(db)

        try:
            documents = extractor.extract_all_documents()
            print(f"✓ Extracted {len(documents)} person records")

            # Show a sample document
            if documents:
                print("\nSample document preview:")
                print("-" * 80)
                sample = documents[0]
                preview_text = sample["text"][:300] + "..." if len(sample["text"]) > 300 else sample["text"]
                print(preview_text)
                print("-" * 80)

        except Exception as e:
            print(f"\n⚠️  Warning: Error extracting documents: {e}")
            print("\nThis likely means you need to customize the SQL queries in src/genealogy_extractor.py")
            print("to match your specific database schema.")
            print("\nPlease see README_GENEALOGY_RAG.md for instructions on customizing the extractor.")
            sys.exit(1)

        # Step 3: Initialize vector database
        print("\n[3/4] Initializing ChromaDB vector database...")
        vdb = VectorDatabase()
        indexer = GenealogyIndexer(vdb)
        print("✓ Vector database initialized")

        # Step 4: Index documents
        print("\n[4/4] Indexing documents (this may take a moment)...")

        # Check if collection already exists
        if indexer.collection_exists():
            response = input("\n⚠️  Index already exists. Reindex? This will delete existing data. (y/N): ")
            if response.lower() != 'y':
                print("\nSetup cancelled. Existing index preserved.")
                stats = indexer.get_stats()
                print(f"\nCurrent index has {stats['document_count']} documents.")
                print("\nYou can now run: python genealogy_chat.py")
                return

            print("\nReindexing...")
            count = indexer.reindex(documents)
        else:
            count = indexer.index_documents(documents)

        print(f"✓ Indexed {count} documents")

        # Get final statistics
        stats = indexer.get_stats()

        print_separator()
        print("SETUP COMPLETE!")
        print_separator()
        print("Index Statistics:")
        print(f"  - Collection: {stats['collection_name']}")
        print(f"  - Documents: {stats['document_count']}")
        print(f"  - Status: {stats['status']}")

        print("\nNext steps:")
        print("  1. Run the interactive chat: python genealogy_chat.py")
        print("  2. Or use the API directly in your own code")

        print("\nExample questions you can ask:")
        print("  - Who is [person name]?")
        print("  - Tell me about the [family name] family")
        print("  - Who lived in [place] during [time period]?")
        print()

    except ValueError as e:
        print(f"\n❌ Configuration Error: {e}")
        print("\nPlease ensure your .env file is configured correctly.")
        print("Required variables:")
        print("  - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD")
        print("  - CHROMA_PERSIST_DIR (optional, defaults to ./chroma_db)")
        print("\nSee .env.example for reference.\n")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ Setup Error: {e}")
        print("\nPlease check your configuration and database connection.")
        print("See README_GENEALOGY_RAG.md for troubleshooting.\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
