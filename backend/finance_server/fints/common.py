import datetime
import logging
import sys
import threading
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

from fints.exceptions import FinTSClientError

from finance_server.core.config import settings

_fints_logger = logging.getLogger("fints")
_fints_logger.setLevel(logging.DEBUG if settings.fints_debug else logging.INFO)
if not _fints_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
    _fints_logger.addHandler(handler)
elif settings.fints_debug:
    for handler in _fints_logger.handlers:
        handler.setLevel(logging.DEBUG)

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parents[3]
WORKSPACE_DIR = BASE_DIR.parent

STATE_FILE = BASE_DIR / "state" / ".fints_state"
MAX_DAYS = settings.fints_max_days
INITIAL_SYNC_DAYS = settings.fints_initial_sync_days
TRANSACTIONS_CACHE_TTL_SECONDS = settings.fints_transactions_cache_ttl_seconds
TRANSACTIONS_CACHE_MAX_ENTRIES = settings.fints_transactions_cache_max_entries

_transactions_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_transactions_cache_lock = threading.Lock()


class BankLoginRejected(FinTSClientError):
    """Die Bank hat die Anmeldung waehrend der Dialog-/Sync-Initialisierung abgelehnt."""

    def __init__(
        self,
        message: str,
        *,
        codes: list[str] | None = None,
        bank_messages: list[str] | None = None,
    ):
        super().__init__(message)
        self.codes = codes or []
        self.bank_messages = bank_messages or []

    def to_detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {
            "code": "FINTS_LOGIN_FAILED",
            "message": str(self),
        }
        if self.codes:
            detail["codes"] = self.codes
        if self.bank_messages:
            detail["bank_messages"] = self.bank_messages
        return detail


class TanRequired(Exception):
    def __init__(self, challenge: str | None, decoupled: bool):
        self.challenge = challenge
        self.decoupled = decoupled


class TanTimeout(Exception):
    pass


class VopConfirmationRequired(Exception):
    """Die Bank verlangt eine explizite Bestätigung wegen eines abweichenden
    Namensabgleichs (VOP), bevor der Auftrag freigegeben wird."""

    def __init__(
        self,
        *,
        vop_token: str,
        result: str | None,
        recipient_iban: str,
        recipient_name: str,
        close_match_name: str | None = None,
        other_identification: str | None = None,
        notice: str | None = None,
    ):
        self.vop_token = vop_token
        self.result = result
        self.recipient_iban = recipient_iban
        self.recipient_name = recipient_name
        self.close_match_name = close_match_name
        self.other_identification = other_identification
        self.notice = notice


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
