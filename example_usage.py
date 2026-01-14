"""Example usage of the database connection module."""

from dotenv import load_dotenv
from src.database import DatabaseConnection

# Load environment variables from .env file
load_dotenv()


def main():
    """Demonstrate database operations."""
    # Create database connection (uses environment variables)
    with DatabaseConnection() as db:
        # Example 1: Create a table
        print("Creating example table...")
        db.execute_update(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # Example 2: Insert data
        print("Inserting sample data...")
        db.execute_update(
            "INSERT INTO users (username, email) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ("john_doe", "john@example.com"),
        )
        db.execute_update(
            "INSERT INTO users (username, email) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ("jane_smith", "jane@example.com"),
        )

        # Example 3: Query data
        print("\nQuerying all users:")
        users = db.execute_query("SELECT id, username, email, created_at FROM users")
        for user in users:
            print(f"  ID: {user[0]}, Username: {user[1]}, Email: {user[2]}, Created: {user[3]}")

        # Example 4: Query with parameters
        print("\nQuerying specific user:")
        user = db.execute_query(
            "SELECT id, username, email FROM users WHERE username = %s",
            ("john_doe",),
        )
        if user:
            print(f"  Found: {user[0]}")

        # Example 5: Update data
        print("\nUpdating user email...")
        rows_affected = db.execute_update(
            "UPDATE users SET email = %s WHERE username = %s",
            ("newemail@example.com", "john_doe"),
        )
        print(f"  Updated {rows_affected} row(s)")

        # Example 6: Using cursor directly for more control
        print("\nUsing cursor directly:")
        with db.get_cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            count = cur.fetchone()[0]
            print(f"  Total users: {count}")

        print("\nDatabase operations completed successfully!")


if __name__ == "__main__":
    main()
