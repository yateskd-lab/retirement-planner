# Genealogy RAG System

A Retrieval-Augmented Generation (RAG) system for querying genealogical data using natural language. This system combines ChromaDB vector database for semantic search with Claude AI for generating intelligent answers about your family history.

## Features

- **Natural Language Queries**: Ask questions about your genealogy data in plain English
- **Semantic Search**: Find relevant information even when exact keywords don't match
- **Intelligent Answers**: Claude AI generates comprehensive answers based on your data
- **Source Citations**: Every answer includes references to the original documents
- **Flexible Schema**: Customizable to work with different genealogy database structures
- **Interactive CLI**: Easy-to-use command-line interface for asking questions

## Architecture

The system consists of four main components:

1. **Data Extractor** (`src/genealogy_extractor.py`)
   - Queries your PostgreSQL genealogy database
   - Joins related tables (persons, events, relationships, sources)
   - Formats records as human-readable documents

2. **Document Indexer** (`src/genealogy_indexer.py`)
   - Stores documents in ChromaDB vector database
   - Creates semantic embeddings for similarity search
   - Manages the document collection

3. **RAG Query Engine** (`src/genealogy_rag.py`)
   - Retrieves relevant documents for a question
   - Sends context to Claude API
   - Generates accurate, sourced answers

4. **Interactive CLI** (`genealogy_chat.py`)
   - User-friendly question-answer interface
   - Shows answers with source citations
   - Supports helpful commands

## Setup

### 1. Install Dependencies

```bash
# Install the project with all dependencies
pip install -e ".[dev]"
```

### 2. Get an Anthropic API Key

1. Visit [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create an account if you don't have one
3. Generate a new API key
4. Save it for the next step

### 3. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your credentials
```

Required configuration in `.env`:

```bash
# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_genealogy_database
DB_USER=your_username
DB_PASSWORD=your_password

# ChromaDB Vector Database
CHROMA_PERSIST_DIR=./chroma_db

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

### 4. Customize the Data Extractor

**IMPORTANT**: The data extractor includes example SQL queries that need to be customized for your specific database schema.

Edit `src/genealogy_extractor.py` and customize these methods:

- `_get_persons()` - Query your persons/individuals table
- `_get_person_events()` - Query events (births, deaths, marriages, etc.)
- `_get_person_relationships()` - Query family relationships
- `_format_person_document()` - Format how documents appear in search results

Example customization:

```python
def _get_persons(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    # Replace this query with one that matches YOUR schema
    query = """
        SELECT
            person_id,        -- Use your column names
            given_name,       -- Might be different in your DB
            surname,
            birth_year,
            birth_location,
            death_year,
            death_location
        FROM individuals     -- Use your table name
        ORDER BY person_id
    """
    # ... rest of the method
```

### 5. Run the Setup Script

This extracts your genealogy data and builds the search index:

```bash
python setup_genealogy_rag.py
```

The setup script will:
- Connect to your PostgreSQL database
- Extract all person records with related events and relationships
- Create embeddings and index documents in ChromaDB
- Show statistics about the indexed data

### 6. Start Querying!

```bash
python genealogy_chat.py
```

## Usage

### Interactive Chat

The main way to use the system is through the interactive CLI:

```bash
python genealogy_chat.py
```

**Example Questions:**

```
You: Who is John Smith?
You: Tell me about the Smith family
You: Who are the ancestors of Mary Johnson?
You: Who lived in Boston during the 1800s?
You: What do you know about people who were carpenters?
You: Tell me about marriages in the Johnson family
```

**Available Commands:**

- `/help` - Show help information
- `/stats` - Display index statistics
- `/examples` - Show example questions
- `/exit` or `/quit` - Exit the chat

### Programmatic Usage

You can also use the components directly in your own Python code:

```python
from dotenv import load_dotenv
from src.database import DatabaseConnection
from src.vectordb import VectorDatabase
from src.genealogy_extractor import GenealogyExtractor
from src.genealogy_indexer import GenealogyIndexer
from src.genealogy_rag import GenealogyRAG

# Load configuration
load_dotenv()

# Initialize components
db = DatabaseConnection()
vdb = VectorDatabase()
extractor = GenealogyExtractor(db)
indexer = GenealogyIndexer(vdb)
rag = GenealogyRAG(indexer)

# Query
result = rag.query("Who is John Smith?")

print(result["answer"])
for source in result["sources"]:
    print(f"Source: {source['id']}")
    print(f"Relevance: {source['relevance_score']:.3f}")
```

## Customization Guide

### Adapting to Different Database Schemas

Since genealogy databases vary widely, you'll need to customize the extractor:

1. **Single Table Schema**
   - If all person data is in one table, modify `_get_persons()` only
   - Set `include_relationships=False` when calling `extract_all_documents()`

2. **Multiple Tables with Different Structure**
   - Update join logic in `_get_person_events()` and `_get_person_relationships()`
   - Adjust column mappings in each method
   - Update `_format_person_document()` to match your data structure

3. **Custom Metadata**
   - Edit `_extract_metadata()` to include fields you want to filter by
   - Add fields like: region, occupation, source_type, confidence_level

### Customizing Document Format

The `_format_person_document()` method controls how documents appear in search results. Customize it to:

- Add more biographical details
- Include source citations
- Format dates differently
- Add narrative summaries
- Include DNA or genetic information

### Adjusting Query Behavior

In `src/genealogy_rag.py`, you can customize:

- `model` - Use different Claude models (default: claude-sonnet-4-5-20251101)
- `max_context_documents` - Number of documents to retrieve (default: 5)
- System prompt in `_generate_answer()` - Adjust how Claude responds

## System Prompts and Behavior

The RAG system uses this system prompt for Claude:

```
You are a genealogical research assistant. Your role is to answer questions
about people and families based on genealogical records provided to you.

Instructions:
- Answer questions accurately based ONLY on the information in the provided documents
- If the documents don't contain enough information to answer the question, say so
- When mentioning people, include relevant dates and relationships when available
- Be concise but thorough
- If multiple people match a query, mention all of them
- Always cite which document(s) you're using by mentioning "according to Document X"
```

You can modify this in `src/genealogy_rag.py` to change how Claude answers questions.

## Testing

Run the test suite to verify everything works:

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_genealogy_rag.py

# Run with coverage
pytest --cov=src --cov-report=html
```

Tests use mocks and don't require a real database or API connection.

## Cost Considerations

### ChromaDB
- Free for local/self-hosted use
- Uses built-in embeddings (no API costs)
- Storage: ~1-10 KB per person document

### Anthropic API (Claude)
Using Claude Sonnet 4.5 (default model):
- Input tokens: ~$3 per million tokens
- Output tokens: ~$15 per million tokens

**Typical Costs Per Query:**
- Context: ~500-2000 tokens (retrieved documents)
- Answer: ~100-500 tokens
- **Cost per query: $0.001 - $0.01** (about 1 cent per question)

For 1000 queries per month: approximately $10-20

## Troubleshooting

### "API key required" Error

**Problem**: Missing Anthropic API key

**Solution**:
1. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Add it to your `.env` file: `ANTHROPIC_API_KEY=sk-ant-...`

### "Database credentials required" Error

**Problem**: Missing database configuration

**Solution**:
1. Ensure `.env` file exists (copy from `.env.example`)
2. Add all database credentials: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### "Error extracting documents" During Setup

**Problem**: SQL queries don't match your database schema

**Solution**:
1. Open `src/genealogy_extractor.py`
2. Customize the SQL queries in `_get_persons()`, `_get_person_events()`, and `_get_person_relationships()`
3. Update column names and table names to match your schema
4. Run setup again: `python setup_genealogy_rag.py`

### Empty or Poor Quality Answers

**Problem**: Not enough relevant documents in index, or documents lack detail

**Solution**:
1. Check index stats: run `genealogy_chat.py` and type `/stats`
2. Preview your documents: run `python` and:
   ```python
   from src.database import DatabaseConnection
   from src.genealogy_extractor import GenealogyExtractor
   db = DatabaseConnection()
   extractor = GenealogyExtractor(db)
   doc = extractor.get_sample_document(1)  # Replace 1 with a real person ID
   print(doc['text'])
   ```
3. Enhance `_format_person_document()` to include more information
4. Reindex: `python setup_genealogy_rag.py`

### ChromaDB Permission Errors

**Problem**: Can't write to `./chroma_db` directory

**Solution**:
1. Ensure you have write permissions in the project directory
2. Or change the location in `.env`: `CHROMA_PERSIST_DIR=/path/to/writable/directory`

## Database Schema Examples

### Example 1: Gramps Database

If using [Gramps](https://gramps-project.org/) genealogy software:

```python
def _get_persons(self, limit: Optional[int] = None):
    query = """
        SELECT
            p.handle,
            n.first_name,
            n.surname_list,
            p.birth_ref,
            p.death_ref,
            p.gender
        FROM person p
        LEFT JOIN name n ON p.handle = n.person_handle
        ORDER BY p.handle
    """
    # Continue with Gramps-specific logic...
```

### Example 2: GEDCOM Import

If you imported GEDCOM data:

```python
def _get_persons(self, limit: Optional[int] = None):
    query = """
        SELECT
            i.id,
            i.given_name,
            i.surname,
            i.sex,
            e_birth.date AS birth_date,
            e_birth.place AS birth_place,
            e_death.date AS death_date,
            e_death.place AS death_place
        FROM individuals i
        LEFT JOIN events e_birth ON i.id = e_birth.individual_id AND e_birth.type = 'BIRT'
        LEFT JOIN events e_death ON i.id = e_death.individual_id AND e_death.type = 'DEAT'
        ORDER BY i.id
    """
    # Continue with GEDCOM-specific logic...
```

## Performance

- **Indexing**: ~100-500 documents per second
- **Query**: ~1-3 seconds per question (depends on Claude API latency)
- **Storage**: ~1-10 KB per person document
- **Memory**: ~100 MB for ChromaDB, scales with document count

For very large databases (>100,000 people):
- Index in batches (already supported)
- Consider pagination in queries
- Use metadata filters to narrow search scope

## Future Enhancements

Potential improvements you could add:

- **Multi-language support**: Translate queries and answers
- **Timeline generation**: Create visual timelines from events
- **Relationship graphs**: Generate family tree visualizations
- **Source verification**: Track confidence levels and source quality
- **Batch queries**: Process multiple questions at once
- **Export functionality**: Save answers as reports or PDFs
- **Web interface**: Build a web UI instead of CLI

## Support and Contributing

This is a customizable template for building genealogy RAG systems. Feel free to:

- Adapt it to your specific database schema
- Enhance the document formatting
- Add new query types and features
- Integrate with other genealogy tools

## License

This project uses:
- **ChromaDB**: Apache 2.0 License
- **Anthropic Claude API**: Subject to Anthropic's terms of service
- **Project Code**: [Your chosen license]

## Additional Resources

- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Claude Model Details](https://www.anthropic.com/claude)
- [RAG Best Practices](https://www.anthropic.com/research/retrieval-augmented-generation)
