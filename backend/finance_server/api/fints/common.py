import datetime
import logging
import os
import sys
import threading
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

logging.getLogger("fints").setLevel(logging.ERROR)

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parents[3]
WORKSPACE_DIR = BASE_DIR.parent
load_dotenv(BASE_DIR / ".env")

def get_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise KeyError(name)
    return value

STATE_FILE = BASE_DIR / "state" / ".fints_state"
LEGACY_STATE_FILE = WORKSPACE_DIR / ".fints_state"
MAX_DAYS = int(os.environ.get("FINTS_MAX_DAYS", "36500"))
INITIAL_SYNC_DAYS = int(os.environ.get("FINTS_INITIAL_SYNC_DAYS", "730"))
TRANSACTIONS_CACHE_TTL_SECONDS = int(os.environ.get("FINTS_TRANSACTIONS_CACHE_TTL_SECONDS", "120"))
TRANSACTIONS_CACHE_MAX_ENTRIES = int(os.environ.get("FINTS_TRANSACTIONS_CACHE_MAX_ENTRIES", "32"))

_transactions_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_transactions_cache_lock = threading.Lock()

class TanRequired(Exception):
    def __init__(self, challenge: str | None, decoupled: bool):
        self.challenge = challenge
        self.decoupled = decoupled

class TanTimeout(Exception):
    pass

def to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime.date, datetime.datetime, Decimal)):
        return str(value)
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(v) for v in value]
    if hasattr(value, "__dict__"):
        try:
            return {k: to_jsonable(v) for k, v in vars(value).items()}
        except Exception:
            return str(value)
    return str(value)

def to_decimal_or_none(raw_value: Any) -> float | None:
    if raw_value is None:
        return None
    try:
        return float(str(raw_value))
    except Exception:
        return None

def build_transactions_cache_key(username: str, days: int, iban: str | None) -> str:
    return f"{username}:{days}:{iban or '*'}"

def get_cached_transactions(cache_key: str) -> dict[str, Any] | None:
    if TRANSACTIONS_CACHE_TTL_SECONDS <= 0:
        return None
    now = time.time()
    with _transactions_cache_lock:
        cached = _transactions_cache.get(cache_key)
        if cached is None:
            return None
        expires_at, payload = cached
        if now >= expires_at:
            _transactions_cache.pop(cache_key, None)
            return None
        return payload

def set_cached_transactions(cache_key: str, payload: dict[str, Any]) -> None:
    if TRANSACTIONS_CACHE_TTL_SECONDS <= 0:
        return
    expires_at = time.time() + TRANSACTIONS_CACHE_TTL_SECONDS
    with _transactions_cache_lock:
        now = time.time()
        expired_keys = [key for key, (entry_expires_at, _) in _transactions_cache.items() if now >= entry_expires_at]
        for key in expired_keys:
            _transactions_cache.pop(key, None)
        _transactions_cache[cache_key] = (expires_at, payload)
        while len(_transactions_cache) > max(1, TRANSACTIONS_CACHE_MAX_ENTRIES):
            oldest_key = next(iter(_transactions_cache))
            _transactions_cache.pop(oldest_key, None)

def format_local_date(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    if text.count(".") == 2:
        return text

    if "T" in text:
        text = text.split("T", 1)[0]

    try:
        parsed = datetime.date.fromisoformat(text)
        return parsed.strftime("%d.%m.%Y")
    except ValueError:
        return text
