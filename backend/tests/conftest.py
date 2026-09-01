from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from finance_server.core.schema import initialize_database


@pytest.fixture(autouse=True)
def _isolate_global_db(monkeypatch, tmp_path):
    """Redirect the global DB path so tests never write into the real prod DB.

    Code paths that call get_connection() from finance_server.core.database
    (e.g. the sync logger's log_sync_op) otherwise hit the production
    finance.db and leak test data into the prod system via sync ops.
    """
    from finance_server.core import database
    from finance_server.core.config import settings

    monkeypatch.setattr(settings, "finance_db_file", str(tmp_path / "global-test.db"))
    monkeypatch.setattr(database, "_database_initialized", False)
    yield
    monkeypatch.setattr(database, "_database_initialized", False)


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
