from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_STATE_DIR = BASE_DIR / "state"
DEFAULT_DB_FILE = DB_STATE_DIR / "finance.db"
DEFAULT_CREDENTIALS_KEY_FILE = DB_STATE_DIR / ".credentials.key"


def get_db_path() -> Path:
    return Path(os.environ.get("FINANCE_DB_FILE", str(DEFAULT_DB_FILE)))


def get_credentials_key_path() -> Path:
    return Path(os.environ.get("FINANCE_CREDENTIALS_KEY_FILE", str(DEFAULT_CREDENTIALS_KEY_FILE)))
