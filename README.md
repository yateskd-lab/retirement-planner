# claude-code-proj

A Python project.

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
