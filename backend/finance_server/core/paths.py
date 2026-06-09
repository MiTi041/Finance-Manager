from __future__ import annotations

import logging
from pathlib import Path

from finance_server.core.config import settings

BASE_DIR = Path(__file__).resolve().parent.parent
DB_STATE_DIR = BASE_DIR / "db" / "state"
DEFAULT_DB_FILE = DB_STATE_DIR / "finance.db"
DEFAULT_CREDENTIALS_KEY_FILE = DB_STATE_DIR / ".credentials.key"

logger = logging.getLogger(__name__)


def get_db_path() -> Path:
    if settings.finance_db_file:
        db_path = Path(settings.finance_db_file)
    else:
        db_path = DEFAULT_DB_FILE
    logger.info("Resolved DB path: %s", db_path)
    return db_path


def get_credentials_key_path() -> Path:
    if settings.finance_credentials_key_file:
        key_path = Path(settings.finance_credentials_key_file)
    else:
        key_path = DEFAULT_CREDENTIALS_KEY_FILE
    logger.info("Resolved credentials key path: %s", key_path)
    return key_path
