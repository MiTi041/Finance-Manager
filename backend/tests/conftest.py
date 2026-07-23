from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from finance_server.core.schema import initialize_database


@pytest.fixture
def test_db() -> sqlite3.Connection:
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    initialize_database(conn)
    yield conn
    conn.close()
    Path(db_path).unlink()
