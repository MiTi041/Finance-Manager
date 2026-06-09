import sqlite3
import threading

from finance_server.core.paths import get_db_path
from finance_server.core.schema import initialize_database


_database_init_lock = threading.Lock()
_database_initialized = False


def _ensure_database_initialized(connection: sqlite3.Connection) -> None:
    global _database_initialized

    if _database_initialized:
        return

    with _database_init_lock:
        if _database_initialized:
            return

        initialize_database(connection)
        _database_initialized = True


def get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    _ensure_database_initialized(connection)
    return connection


def reset_connection_state() -> None:
    global _database_initialized
    with _database_init_lock:
        _database_initialized = False
