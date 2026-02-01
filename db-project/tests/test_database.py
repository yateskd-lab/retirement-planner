"""Tests for database connection module."""

import os
from unittest.mock import Mock, patch, MagicMock
import pytest
from src.database import DatabaseConnection


class TestDatabaseConnection:
    """Test DatabaseConnection class."""

    @patch.dict(
        os.environ,
        {
            "DB_HOST": "testhost",
            "DB_PORT": "5433",
            "DB_NAME": "testdb",
            "DB_USER": "testuser",
            "DB_PASSWORD": "testpass",
        },
    )
    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_init_with_env_vars(self, mock_pool):
        """Test initialization using environment variables."""
        db = DatabaseConnection()

        assert db.host == "testhost"
        assert db.port == 5433
        assert db.database == "testdb"
        assert db.user == "testuser"
        assert db.password == "testpass"

        mock_pool.assert_called_once_with(
            1,
            10,
            host="testhost",
            port=5433,
            database="testdb",
            user="testuser",
            password="testpass",
        )

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_init_with_arguments(self, mock_pool):
        """Test initialization with explicit arguments."""
        db = DatabaseConnection(
            host="myhost",
            port=5555,
            database="mydb",
            user="myuser",
            password="mypass",
            min_connections=2,
            max_connections=20,
        )

        assert db.host == "myhost"
        assert db.port == 5555
        assert db.database == "mydb"
        assert db.user == "myuser"
        assert db.password == "mypass"

        mock_pool.assert_called_once_with(
            2,
            20,
            host="myhost",
            port=5555,
            database="mydb",
            user="myuser",
            password="mypass",
        )

    @patch.dict(os.environ, {}, clear=True)
    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_init_missing_credentials(self, mock_pool):
        """Test that missing credentials raise ValueError."""
        with pytest.raises(ValueError, match="Database credentials required"):
            DatabaseConnection()

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_get_connection_context_manager(self, mock_pool):
        """Test get_connection context manager."""
        mock_conn = Mock()
        mock_pool_instance = Mock()
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool.return_value = mock_pool_instance

        db = DatabaseConnection(
            host="host", database="db", user="user", password="pass"
        )

        with db.get_connection() as conn:
            assert conn == mock_conn

        mock_conn.commit.assert_called_once()
        mock_pool_instance.putconn.assert_called_once_with(mock_conn)

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_get_connection_rollback_on_error(self, mock_pool):
        """Test that get_connection rolls back on exception."""
        mock_conn = Mock()
        mock_pool_instance = Mock()
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool.return_value = mock_pool_instance

        db = DatabaseConnection(
            host="host", database="db", user="user", password="pass"
        )

        with pytest.raises(ValueError):
            with db.get_connection() as conn:
                raise ValueError("Test error")

        mock_conn.rollback.assert_called_once()
        mock_pool_instance.putconn.assert_called_once_with(mock_conn)

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_execute_query(self, mock_pool):
        """Test execute_query method."""
        mock_cursor = Mock()
        mock_cursor.fetchall.return_value = [(1, "test")]
        mock_conn = Mock()
        mock_conn.cursor.return_value = mock_cursor
        mock_pool_instance = Mock()
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool.return_value = mock_pool_instance

        db = DatabaseConnection(
            host="host", database="db", user="user", password="pass"
        )

        result = db.execute_query("SELECT * FROM test", ("param",))

        assert result == [(1, "test")]
        mock_cursor.execute.assert_called_once_with("SELECT * FROM test", ("param",))
        mock_cursor.fetchall.assert_called_once()

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_execute_update(self, mock_pool):
        """Test execute_update method."""
        mock_cursor = Mock()
        mock_cursor.rowcount = 5
        mock_conn = Mock()
        mock_conn.cursor.return_value = mock_cursor
        mock_pool_instance = Mock()
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool.return_value = mock_pool_instance

        db = DatabaseConnection(
            host="host", database="db", user="user", password="pass"
        )

        result = db.execute_update("UPDATE test SET x = %s", (123,))

        assert result == 5
        mock_cursor.execute.assert_called_once_with("UPDATE test SET x = %s", (123,))

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_close(self, mock_pool):
        """Test close method."""
        mock_pool_instance = Mock()
        mock_pool.return_value = mock_pool_instance

        db = DatabaseConnection(
            host="host", database="db", user="user", password="pass"
        )
        db.close()

        mock_pool_instance.closeall.assert_called_once()

    @patch("src.database.psycopg2.pool.SimpleConnectionPool")
    def test_context_manager(self, mock_pool):
        """Test context manager protocol."""
        mock_pool_instance = Mock()
        mock_pool.return_value = mock_pool_instance

        with DatabaseConnection(
            host="host", database="db", user="user", password="pass"
        ) as db:
            assert db is not None

        mock_pool_instance.closeall.assert_called_once()
