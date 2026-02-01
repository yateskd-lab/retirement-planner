# claude-code-proj

A Python project with PostgreSQL database connectivity.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -e ".[dev]"
```

3. Configure database connection:
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

## Development

Run tests:
```bash
pytest
```

Format code:
```bash
black src tests
```

Lint code:
```bash
ruff check src tests
```

Type check:
```bash
mypy src
```

## Database Usage

Run the example script to see database operations in action:
```bash
python example_usage.py
```

Basic usage in your code:
```python
from src.database import DatabaseConnection

with DatabaseConnection() as db:
    # Query data
    users = db.execute_query("SELECT * FROM users")

    # Insert/Update data
    db.execute_update(
        "INSERT INTO users (username, email) VALUES (%s, %s)",
        ("john_doe", "john@example.com")
    )
```

## Features

- PostgreSQL connection pooling for efficient database access
- Environment-based configuration (no hardcoded credentials)
- Context managers for automatic resource cleanup
- Helper methods for common database operations
- Comprehensive test suite with mocks (no database required for testing)
