from __future__ import annotations

import logging
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_STATE_DIR = BASE_DIR / "state"
DEFAULT_DB_FILE = DB_STATE_DIR / "finance.db"
DEFAULT_CREDENTIALS_KEY_FILE = DB_STATE_DIR / ".credentials.key"

logger = logging.getLogger(__name__)


def get_db_path() -> Path:
    db_path = Path(os.environ.get("FINANCE_DB_FILE", str(DEFAULT_DB_FILE)))
    logger.info("Resolved DB path: %s (FINANCE_DB_FILE=%s)", db_path, os.environ.get("FINANCE_DB_FILE", "(not set)"))
    return db_path


def get_credentials_key_path() -> Path:
    key_path = Path(os.environ.get("FINANCE_CREDENTIALS_KEY_FILE", str(DEFAULT_CREDENTIALS_KEY_FILE)))
    logger.info("Resolved credentials key path: %s", key_path)
    return key_path
