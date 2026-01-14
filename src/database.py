"""Database connection and utilities for PostgreSQL."""

import os
from contextlib import contextmanager
from typing import Optional, Generator

import psycopg2
from psycopg2 import pool
from psycopg2.extensions import connection, cursor


class DatabaseConnection:
    """Manages PostgreSQL database connections using a connection pool."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        database: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        min_connections: int = 1,
        max_connections: int = 10,
    ):
        """
        Initialize database connection pool.

        Args:
            host: Database host (defaults to DB_HOST env var or 'localhost')
            port: Database port (defaults to DB_PORT env var or 5432)
            database: Database name (defaults to DB_NAME env var)
            user: Database user (defaults to DB_USER env var)
            password: Database password (defaults to DB_PASSWORD env var)
            min_connections: Minimum number of connections in pool
            max_connections: Maximum number of connections in pool
        """
        self.host = host or os.getenv("DB_HOST", "localhost")
        self.port = port or int(os.getenv("DB_PORT", "5432"))
        self.database = database or os.getenv("DB_NAME")
        self.user = user or os.getenv("DB_USER")
        self.password = password or os.getenv("DB_PASSWORD")

        if not all([self.database, self.user, self.password]):
            raise ValueError(
                "Database credentials required. Provide via arguments or environment variables "
                "(DB_NAME, DB_USER, DB_PASSWORD)"
            )

        self.pool = psycopg2.pool.SimpleConnectionPool(
            min_connections,
            max_connections,
            host=self.host,
            port=self.port,
            database=self.database,
            user=self.user,
            password=self.password,
        )

    @contextmanager
    def get_connection(self) -> Generator[connection, None, None]:
        """
        Context manager for getting a connection from the pool.

        Yields:
            psycopg2 connection object

        Example:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM users")
                    results = cur.fetchall()
        """
        conn = self.pool.getconn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self.pool.putconn(conn)

    @contextmanager
    def get_cursor(self) -> Generator[cursor, None, None]:
        """
        Context manager for getting a cursor.

        Yields:
            psycopg2 cursor object

        Example:
            with db.get_cursor() as cur:
                cur.execute("SELECT * FROM users")
                results = cur.fetchall()
        """
        with self.get_connection() as conn:
            cur = conn.cursor()
            try:
                yield cur
            finally:
                cur.close()

    def execute_query(self, query: str, params: Optional[tuple] = None) -> list:
        """
        Execute a SELECT query and return results.

        Args:
            query: SQL query string
            params: Query parameters (optional)

        Returns:
            List of tuples containing query results
        """
        with self.get_cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

    def execute_update(self, query: str, params: Optional[tuple] = None) -> int:
        """
        Execute an INSERT, UPDATE, or DELETE query.

        Args:
            query: SQL query string
            params: Query parameters (optional)

        Returns:
            Number of affected rows
        """
        with self.get_cursor() as cur:
            cur.execute(query, params)
            return cur.rowcount

    def close(self):
        """Close all connections in the pool."""
        if self.pool:
            self.pool.closeall()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
