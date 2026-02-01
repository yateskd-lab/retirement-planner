"""RAG (Retrieval-Augmented Generation) query engine for genealogical data."""

import os
from typing import List, Dict, Any, Optional
from anthropic import Anthropic
from src.genealogy_indexer import GenealogyIndexer


class GenealogyRAG:
    """
    RAG query engine that combines vector search with Claude API.

    This class provides a question-answering interface for genealogical data
    by retrieving relevant documents and using Claude to generate answers.
    """

    def __init__(
        self,
        indexer: GenealogyIndexer,
        api_key: Optional[str] = None,
        model: str = "claude-sonnet-4-5-20251101",
        max_context_documents: int = 5,
    ):
        """
        Initialize the RAG query engine.

        Args:
            indexer: GenealogyIndexer instance for document retrieval
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
            model: Claude model to use for answer generation
            max_context_documents: Maximum number of documents to include in context
        """
        self.indexer = indexer
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")

        if not self.api_key:
            raise ValueError(
                "Anthropic API key required. Provide via api_key parameter or "
                "ANTHROPIC_API_KEY environment variable"
            )

        self.client = Anthropic(api_key=self.api_key)
        self.model = model
        self.max_context_documents = max_context_documents

    def query(
        self,
        question: str,
        n_results: Optional[int] = None,
        metadata_filter: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Answer a question using RAG.

        Args:
            question: Natural language question about genealogical data
            n_results: Number of documents to retrieve (defaults to max_context_documents)
            metadata_filter: Optional filter for document retrieval

        Returns:
            Dictionary with 'answer', 'sources', and 'usage' keys
        """
        # Use default if not specified
        if n_results is None:
            n_results = self.max_context_documents

        # Retrieve relevant documents
        search_results = self.indexer.search(
            query=question, n_results=n_results, where=metadata_filter
        )

        # Check if we got any results
        if not search_results["documents"][0]:
            return {
                "answer": "I couldn't find any relevant information in the genealogy database to answer your question.",
                "sources": [],
                "usage": None,
            }

        # Extract documents and metadata
        documents = search_results["documents"][0]
        metadatas = search_results["metadatas"][0]
        ids = search_results["ids"][0]
        distances = search_results["distances"][0]

        # Format context for Claude
        context = self._format_context(documents, metadatas, ids)

        # Generate answer using Claude
        response = self._generate_answer(question, context)

        # Format sources
        sources = self._format_sources(documents, metadatas, ids, distances)

        return {"answer": response["answer"], "sources": sources, "usage": response["usage"]}

    def _format_context(
        self, documents: List[str], metadatas: List[Dict], ids: List[str]
    ) -> str:
        """
        Format retrieved documents as context for Claude.

        Args:
            documents: List of document texts
            metadatas: List of document metadata
            ids: List of document IDs

        Returns:
            Formatted context string
        """
        context_parts = ["Here are the relevant genealogy records:\n"]

        for i, (doc, metadata, doc_id) in enumerate(zip(documents, metadatas, ids), 1):
            context_parts.append(f"[Document {i}]")
            context_parts.append(doc)
            context_parts.append("")  # blank line

        return "\n".join(context_parts)

    def _generate_answer(self, question: str, context: str) -> Dict[str, Any]:
        """
        Generate an answer using Claude API.

        Args:
            question: User's question
            context: Formatted context from retrieved documents

        Returns:
            Dictionary with 'answer' and 'usage' keys
        """
        # Create system prompt
        system_prompt = """You are a genealogical research assistant. Your role is to answer questions about people and families based on genealogical records provided to you.

Instructions:
- Answer questions accurately based ONLY on the information in the provided documents
- If the documents don't contain enough information to answer the question, say so
- When mentioning people, include relevant dates and relationships when available
- Be concise but thorough
- If multiple people match a query, mention all of them
- Always cite which document(s) you're using by mentioning "according to Document X"
"""

        # Create user message
        user_message = f"""{context}

Question: {question}

Please answer the question based on the genealogy records above."""

        # Call Claude API
        response = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

        # Extract answer
        answer = response.content[0].text

        # Extract usage statistics
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }

        return {"answer": answer, "usage": usage}

    def _format_sources(
        self,
        documents: List[str],
        metadatas: List[Dict],
        ids: List[str],
        distances: List[float],
    ) -> List[Dict[str, Any]]:
        """
        Format source documents for display.

        Args:
            documents: List of document texts
            metadatas: List of document metadata
            ids: List of document IDs
            distances: List of distance scores

        Returns:
            List of formatted source dictionaries
        """
        sources = []

        for doc, metadata, doc_id, distance in zip(documents, metadatas, ids, distances):
            # Create a preview (first 200 characters)
            preview = doc[:200] + "..." if len(doc) > 200 else doc

            sources.append(
                {
                    "id": doc_id,
                    "preview": preview,
                    "full_text": doc,
                    "metadata": metadata,
                    "relevance_score": 1 - distance,  # Convert distance to similarity score
                }
            )

        return sources

    def get_suggested_questions(self) -> List[str]:
        """
        Get a list of suggested questions users can ask.

        Returns:
            List of example questions
        """
        return [
            "Who is [person name]?",
            "Tell me about the [family name] family",
            "Who are the ancestors of [person name]?",
            "Who lived in [place] during [time period]?",
            "What do you know about people born in [year]?",
            "Who worked as a [occupation]?",
            "Tell me about [person name]'s life events",
            "Who are the children of [person name]?",
        ]
