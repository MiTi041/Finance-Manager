from __future__ import annotations

import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS) # type: ignore
else:
    BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cors_origins: str = ""

    hunter_logo_key: str = ""

    fints_max_days: int = 36500
    fints_initial_sync_days: int = 730
    fints_transactions_cache_ttl_seconds: int = 120
    fints_transactions_cache_max_entries: int = 32

    finance_db_file: str = ""
    finance_credentials_key_file: str = ""
    fints_state_file: str = ""

    fints_rate_limit_fetch_accounts: int = 120
    fints_rate_limit_fetch_transactions: int = 60
    fints_rate_limit_fetch_balance: int = 60
    fints_rate_limit_sync_all: int = 300

    sync_r2_account_id: str = ""
    sync_r2_access_key_id: str = ""
    sync_r2_secret_access_key: str = ""
    sync_r2_bucket: str = "finance-sync"

    vercel: str = ""


settings = Settings()
