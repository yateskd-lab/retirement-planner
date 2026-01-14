# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python project using modern tooling with `pyproject.toml` for configuration. The codebase follows a standard Python package structure with source code in `src/` and tests in `tests/`.

## Development Commands

### Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install project with dev dependencies
pip install -e ".[dev]"
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

## Architecture

### Project Structure
- `src/`: Main package source code
- `tests/`: Test suite (mirrors src/ structure)
- `pyproject.toml`: Project configuration, dependencies, and tool settings

### Configuration
- **Black**: Code formatter with 100 character line length
- **Ruff**: Fast Python linter (replaces flake8, isort, etc.)
- **mypy**: Static type checker (configured for Python 3.9+)
- **pytest**: Test framework with coverage reporting enabled by default

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

## Notes

- The project is installed in editable mode (`-e`), so code changes are immediately reflected without reinstalling
- Test configuration in `pyproject.toml` automatically includes coverage reports
- All tool configurations (black, ruff, mypy, pytest) are centralized in `pyproject.toml`
