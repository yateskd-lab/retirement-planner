# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python project with PostgreSQL database connectivity. It uses modern tooling with `pyproject.toml` for configuration and follows a standard Python package structure with source code in `src/` and tests in `tests/`.

The project includes:
- PostgreSQL database connection management with connection pooling
- Environment-based configuration using `.env` files
- Example usage scripts and comprehensive tests

## Development Commands

### Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install project with dev dependencies
pip install -e ".[dev]"

# Configure database connection
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

### Testing
```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_example.py

# Run specific test function
pytest tests/test_example.py::test_example

# Run with coverage report
pytest --cov=src --cov-report=html
```

### Code Quality
```bash
# Format code (auto-fix)
black src tests

# Lint code
ruff check src tests

# Lint with auto-fix
ruff check --fix src tests

# Type checking
mypy src
```

### Running Examples
```bash
# Run example database usage script
python example_usage.py
```

## Architecture

### Project Structure
- `src/`: Main package source code
  - `database.py`: PostgreSQL connection management with connection pooling
- `tests/`: Test suite (mirrors src/ structure)
  - `test_database.py`: Database module tests (uses mocks, no real DB required)
- `example_usage.py`: Demonstrates database operations
- `pyproject.toml`: Project configuration, dependencies, and tool settings
- `.env`: Database credentials (not tracked in git)
- `.env.example`: Template for database configuration

### Configuration
- **Black**: Code formatter with 100 character line length
- **Ruff**: Fast Python linter (replaces flake8, isort, etc.)
- **mypy**: Static type checker (configured for Python 3.9+)
- **pytest**: Test framework with coverage reporting enabled by default
- **psycopg2-binary**: PostgreSQL database adapter
- **python-dotenv**: Environment variable management

### Python Version
- Minimum: Python 3.9
- Target: Python 3.9 (for maximum compatibility)

## Development Workflow

1. Make changes to source code in `src/`
2. Add/update tests in `tests/` to match
3. Run `black` to format code
4. Run `ruff` to check for lint issues
5. Run `pytest` to verify all tests pass
6. Run `mypy` to verify type correctness (if using type hints)

## Database Architecture

### DatabaseConnection Class (`src/database.py`)
The `DatabaseConnection` class provides a high-level interface for PostgreSQL operations:

- **Connection Pooling**: Uses `psycopg2.pool.SimpleConnectionPool` for efficient connection management
- **Context Managers**: Supports `with` statements for automatic resource cleanup
- **Environment Configuration**: Reads credentials from environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
- **Helper Methods**:
  - `get_connection()`: Get a connection from the pool (context manager)
  - `get_cursor()`: Get a cursor for executing queries (context manager)
  - `execute_query()`: Execute SELECT queries and return results
  - `execute_update()`: Execute INSERT/UPDATE/DELETE and return affected rows

### Usage Pattern
```python
from src.database import DatabaseConnection

# Option 1: Using context manager (recommended)
with DatabaseConnection() as db:
    results = db.execute_query("SELECT * FROM users WHERE id = %s", (user_id,))
    db.execute_update("INSERT INTO logs (message) VALUES (%s)", ("User logged in",))

# Option 2: Manual connection management
db = DatabaseConnection()
try:
    results = db.execute_query("SELECT * FROM users")
finally:
    db.close()
```

## Notes

- The project is installed in editable mode (`-e`), so code changes are immediately reflected without reinstalling
- Test configuration in `pyproject.toml` automatically includes coverage reports
- All tool configurations (black, ruff, mypy, pytest) are centralized in `pyproject.toml`
- Database credentials should never be committed to git (`.env` is in `.gitignore`)
- Database tests use mocks and don't require a real PostgreSQL instance
- The connection pool defaults to 1-10 connections but can be customized
