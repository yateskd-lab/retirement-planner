"""Interactive CLI for querying genealogical data using RAG."""

import sys
from dotenv import load_dotenv
from src.vectordb import VectorDatabase
from src.genealogy_indexer import GenealogyIndexer
from src.genealogy_rag import GenealogyRAG


def print_separator():
    """Print a visual separator."""
    print("\n" + "=" * 80 + "\n")


def print_answer(result: dict):
    """
    Print the answer and sources in a formatted way.

    Args:
        result: Query result dictionary with answer, sources, and usage
    """
    print("\nAnswer:")
    print("-" * 80)
    print(result["answer"])
    print_separator()

    # Print sources
    if result["sources"]:
        print("Sources:")
        print("-" * 80)
        for i, source in enumerate(result["sources"], 1):
            print(f"\n[{i}] Document ID: {source['id']}")
            print(f"    Relevance: {source['relevance_score']:.3f}")

            # Show metadata if available
            metadata = source.get("metadata", {})
            if metadata:
                print("    Metadata:")
                for key, value in metadata.items():
                    print(f"      - {key}: {value}")

            print(f"\n    Preview: {source['preview']}")

        print_separator()

    # Print usage stats if available
    if result.get("usage"):
        usage = result["usage"]
        print(f"Token usage: {usage['input_tokens']} input, {usage['output_tokens']} output")
        print()


def print_help():
    """Print help information."""
    print("\nAvailable commands:")
    print("  /exit, /quit, /q  - Exit the chat")
    print("  /help, /h         - Show this help message")
    print("  /stats            - Show index statistics")
    print("  /examples         - Show example questions")
    print("\nOr just type your genealogy question!\n")


def print_stats(indexer: GenealogyIndexer):
    """
    Print index statistics.

    Args:
        indexer: GenealogyIndexer instance
    """
    stats = indexer.get_stats()
    print("\nIndex Statistics:")
    print("-" * 80)
    print(f"Collection: {stats['collection_name']}")
    print(f"Document count: {stats['document_count']}")
    print(f"Status: {stats['status']}")
    if "error" in stats:
        print(f"Error: {stats['error']}")
    print()


def print_examples(rag: GenealogyRAG):
    """
    Print example questions.

    Args:
        rag: GenealogyRAG instance
    """
    print("\nExample questions you can ask:")
    print("-" * 80)
    for question in rag.get_suggested_questions():
        print(f"  - {question}")
    print()


def main():
    """Run the interactive genealogy chat interface."""
    # Load environment variables
    load_dotenv()

    print("=" * 80)
    print("GENEALOGY RAG CHAT")
    print("=" * 80)
    print("\nInitializing...")

    try:
        # Initialize components
        vdb = VectorDatabase()
        indexer = GenealogyIndexer(vdb)
        rag = GenealogyRAG(indexer)

        # Check if index is ready
        stats = indexer.get_stats()
        if stats["document_count"] == 0:
            print("\n⚠️  WARNING: The document index is empty!")
            print("Please run 'python setup_genealogy_rag.py' first to index your genealogy data.")
            print("\nExiting...\n")
            return

        print(f"\n✓ Ready! {stats['document_count']} documents indexed.")
        print("\nType /help for commands or ask a question about your genealogy data.")
        print("Type /exit to quit.\n")

        # Main chat loop
        while True:
            try:
                # Get user input
                question = input("You: ").strip()

                if not question:
                    continue

                # Handle commands
                if question.lower() in ["/exit", "/quit", "/q"]:
                    print("\nGoodbye!\n")
                    break

                elif question.lower() in ["/help", "/h"]:
                    print_help()
                    continue

                elif question.lower() == "/stats":
                    print_stats(indexer)
                    continue

                elif question.lower() == "/examples":
                    print_examples(rag)
                    continue

                elif question.startswith("/"):
                    print(f"\nUnknown command: {question}")
                    print("Type /help for available commands.\n")
                    continue

                # Query the RAG system
                print("\nSearching...")
                result = rag.query(question)

                # Print the answer
                print_answer(result)

            except KeyboardInterrupt:
                print("\n\nGoodbye!\n")
                break

            except Exception as e:
                print(f"\n❌ Error: {e}\n")
                continue

    except ValueError as e:
        print(f"\n❌ Configuration Error: {e}")
        print("\nPlease ensure you have:")
        print("  1. Set ANTHROPIC_API_KEY in your .env file")
        print("  2. Run 'python setup_genealogy_rag.py' to index your data")
        print("\nSee README_GENEALOGY_RAG.md for setup instructions.\n")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ Initialization Error: {e}")
        print("\nPlease check your configuration and try again.")
        print("See README_GENEALOGY_RAG.md for setup instructions.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
