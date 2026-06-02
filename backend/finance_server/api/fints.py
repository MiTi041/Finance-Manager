import datetime
import hashlib
import json
import logging
import os
import sys
import threading
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from fints.client import FinTS3PinTanClient, NeedTANResponse, TransactionResponse
from fints.exceptions import FinTSClientError
import fints.formals as fints_formals
from fints.utils import minimal_interactive_cli_bootstrap

from finance_server.db import (
    load_bank_credentials,
    list_bank_credentials,
    fetch_latest_transaction as fetch_local_latest_transaction,
    fetch_transactions as fetch_local_transactions,
    insert_transactions as insert_local_transactions,
    save_bank_credentials,
)
from finance_server.db.utils import normalize_text
from finance_server.banks import get_bank_definition
from finance_server.models import BankCredentials

try:
    from fints.hhd.flicker import terminal_flicker_unix
except Exception:  # pragma: no cover
    terminal_flicker_unix = None

NeedVOPResponse = getattr(fints_formals, "NeedVOPResponse", None)

logging.getLogger("fints").setLevel(logging.ERROR)

router = APIRouter()

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parents[2]
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
_sync_status_lock = threading.Lock()
# sync status: { 'current': scope|None, 'progress': [{scope,status,message}], 'last_run': iso }
_sync_state: dict[str, Any] = {"current": None, "progress": [], "last_run": None}

# --- HARTCODIERTE DEFAULTS ---
# Hier kannst du deine feste Produkt-ID eintragen, falls vorhanden.
PRODUCT_ID = os.environ.get("PRODUCT_ID") or os.environ.get("VITE_PRODUCT_ID")

if not PRODUCT_ID:
    logging.warning(
        "PRODUCT_ID nicht gesetzt – FinTS-Bankabruf wird fehlschlagen. "
        "Setze PRODUCT_ID in backend/.env oder als Umgebungsvariable."
    )

class AccountsRequest(BaseModel):
    credentials: BankCredentials | None = None

class TransactionsRequest(BaseModel):
    credentials: BankCredentials | None = None
    scope: str | None = None
    days: int | None = Field(default=None, ge=0, le=MAX_DAYS)
    tan: str | None = None
    iban: str | None = None

class TransferRequest(BaseModel):
    credentials: BankCredentials | None = None
    recipient_iban: str = Field(min_length=15, max_length=34)
    recipient_name: str = Field(min_length=1, max_length=70)
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=1, max_length=140)
    recipient_bic: str | None = Field(default=None, max_length=11)
    tan: str | None = None
    sender_iban: str | None = None
    sender_name: str = Field(default="Finance-Manager", description="Name des Absenders auf dem Beleg")

class TanRequired(Exception):
    def __init__(self, challenge: str | None, decoupled: bool):
        self.challenge = challenge
        self.decoupled = decoupled

class TanTimeout(Exception):
    pass


def resolve_bank_credentials(
    provided: BankCredentials | None = None,
    scope: str | None = None,
) -> BankCredentials:
    if provided is not None:
        save_bank_credentials(provided.model_dump())
        return provided

    stored = load_bank_credentials(scope)
    if stored is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BANK_CREDENTIALS_REQUIRED",
                "message": "Bankzugangsdaten fehlen. Bitte in den Einstellungen speichern.",
            },
        )

    return BankCredentials.model_validate(stored)


def resolve_bank_connection_details(credentials: BankCredentials) -> BankCredentials:
    bank = get_bank_definition(credentials.bank_key)
    return BankCredentials(
        bank_key=bank.key,
        username=credentials.username,
        account_name=credentials.account_name,
        pin=credentials.pin,
    )

# --- State & Helpers ---

def get_state_file_paths() -> list[Path]:
    configured_state = os.environ.get("FINTS_STATE_FILE")
    if configured_state:
        configured_path = Path(configured_state)
        primary = configured_path if configured_path.is_absolute() else (WORKSPACE_DIR / configured_path)
    elif os.environ.get("VERCEL"):
        primary = Path("/tmp/.fints_state")
    else:
        primary = STATE_FILE

    paths = [primary]
    if primary != LEGACY_STATE_FILE:
        paths.append(LEGACY_STATE_FILE)
    return paths


def get_state_file_paths_for_creds(creds: BankCredentials) -> list[Path]:
    configured_state = os.environ.get("FINTS_STATE_FILE")
    if configured_state:
        configured_path = Path(configured_state)
        primary = configured_path if configured_path.is_absolute() else (WORKSPACE_DIR / configured_path)
    elif os.environ.get("VERCEL"):
        primary = Path(f"/tmp/.fints_state_{creds.bank_key}_{creds.username}")
    else:
        primary = STATE_FILE.parent / f".fints_state_{creds.bank_key}_{creds.username}"

    paths = [primary]
    # also include the global legacy path as fallback
    paths.append(LEGACY_STATE_FILE)
    return paths

def load_state(creds: BankCredentials | None = None) -> bytes | None:
    paths = get_state_file_paths_for_creds(creds) if creds is not None else get_state_file_paths()
    for path in paths:
        try:
            if path.exists():
                return path.read_bytes()
        except Exception:
            continue
    return None

def save_state(client: FinTS3PinTanClient, creds: BankCredentials | None = None) -> None:
    state_blob = client.deconstruct(including_private=True)
    paths = get_state_file_paths_for_creds(creds) if creds is not None else get_state_file_paths()
    for path in paths:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(state_blob)
            return
        except Exception:
            continue

def clear_state_files() -> None:
    for path in get_state_file_paths():
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass


def clear_state_files_for_creds(creds: BankCredentials | None = None) -> None:
    paths = get_state_file_paths_for_creds(creds) if creds is not None else get_state_file_paths()
    for path in paths:
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass

def should_retry_without_state(err: Exception) -> bool:
    message = str(err).lower()
    return (
        isinstance(err, KeyError)
        or "could not fetch bpd" in message
        or "dialog initialization" in message
        or "unknown tan mechanism" in message
        or "999" in message
    )


def bootstrap_client(client: FinTS3PinTanClient) -> None:
    minimal_interactive_cli_bootstrap(client)

def make_client(creds: BankCredentials, from_data: bytes | None) -> FinTS3PinTanClient:
    bank = get_bank_definition(creds.bank_key)
    return FinTS3PinTanClient(
        bank_identifier=bank.blz,
        user_id=creds.username,
        pin=creds.pin,
        server=bank.fints_url,
        product_id=PRODUCT_ID,
        customer_id=creds.username,
        from_data=from_data,
    )

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

# --- Cache- & lokale DB-Logik ---

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


def normalize_local_amount(raw_value: Any) -> float:
    if raw_value is None:
        return 0.0
    try:
        # Konvertiere direkt in einen sauberen Float für die SQLite REAL-Spalte
        return float(Decimal(str(raw_value)))
    except Exception:
        return 0.0


def store_transactions_in_local_db(transactions: list[dict[str, Any]]) -> int:
    if not transactions:
        return 0
    result = insert_local_transactions(transactions)

    return int(result.get("inserted", 0))


def list_transactions_from_local_db(days: int | None, iban: str | None) -> list[dict[str, Any]]:
    effective_days = MAX_DAYS if days is None else days
    return fetch_local_transactions(days=effective_days, account_iban=iban)


def resolve_auto_sync_days(iban: str | None) -> int:
    latest_row = fetch_local_latest_transaction()
    if not latest_row:
        return min(MAX_DAYS, max(1, INITIAL_SYNC_DAYS))
    # Use the DB fields `entry_date` and `date` (fallback order)
    candidates = [latest_row.get("entry_date"), latest_row.get("date")]
    if iban and latest_row.get("account_iban") != iban:
        filtered_rows = fetch_local_transactions(days=MAX_DAYS, account_iban=iban)
        if not filtered_rows:
            return min(MAX_DAYS, max(1, INITIAL_SYNC_DAYS))
        candidates = [filtered_rows[0].get("entry_date"), filtered_rows[0].get("date")]

    latest_date: datetime.date | None = None
    for candidate in candidates:
        if not candidate:
            continue
        try:
            # Try German format first
            latest_date = datetime.datetime.strptime(str(candidate), "%d.%m.%Y").date()
            break
        except ValueError:
            try:
                latest_date = datetime.date.fromisoformat(str(candidate).split("T", 1)[0])
                break
            except ValueError:
                continue

    if latest_date is None:
        return min(MAX_DAYS, max(1, INITIAL_SYNC_DAYS))

    days = (datetime.date.today() - latest_date).days
    return max(0, min(MAX_DAYS, days))

# --- TAN- & Core FinTS-Logik ---

def validate_transfer_result(result: Any) -> None:
    if not isinstance(result, TransactionResponse):
        return
    responses = [{"code": getattr(r, "code", None), "text": getattr(r, "text", None)} for r in getattr(result, "responses", [])]
    codes = {r["code"] for r in responses if r["code"]}
    if "9160" in codes:
        raise TanRequired(challenge="Erforderliche TAN fehlt.", decoupled=False)
    if any(isinstance(r["code"], str) and r["code"].startswith("9") for r in responses):
        raise HTTPException(status_code=502, detail={"code": "FINTS_TRANSFER_FAILED", "message": "Bank meldet Fehler bei der Ueberweisung.", "responses": responses})

def resolve_tan(client: FinTS3PinTanClient, response: NeedTANResponse, tan: str | None) -> Any:
    if response.decoupled:
        return client.send_tan(response, "")
    if terminal_flicker_unix and getattr(response, "challenge_hhduc", None):
        try: terminal_flicker_unix(response.challenge_hhduc)
        except Exception: pass
    if tan is None:
        raise TanRequired(challenge=response.challenge, decoupled=bool(response.decoupled))
    return client.send_tan(response, tan)

def resolve_tan_until_done(client: FinTS3PinTanClient, response: NeedTANResponse, tan: str | None, max_wait_seconds: int = 90, poll_seconds: int = 3) -> Any:
    result, elapsed = response, 0
    while isinstance(result, NeedTANResponse):
        result = resolve_tan(client, result, tan)
        tan = None
        if isinstance(result, NeedTANResponse) and result.decoupled:
            if elapsed >= max_wait_seconds:
                raise TanTimeout("SCA-Freigabe nicht rechtzeitig bestätigt. Bitte in der Banking-App freigeben.")
            time.sleep(poll_seconds)
            elapsed += poll_seconds
    return result

# --- Core Actions ---

def fetch_accounts(creds: BankCredentials) -> dict[str, Any]:
    def _run(from_data: bytes | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)
        accounts = []
        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, None)
            save_state(client, creds)
            for acc in client.get_sepa_accounts():
                accounts.append({
                    "iban": acc.iban, "bic": acc.bic, "accountnumber": acc.accountnumber,
                    "blz": acc.blz, "currency": getattr(acc, "currency", "EUR")
                })
        return {"count": len(accounts), "accounts": accounts}

    state = load_state(creds)
    try:
        return _run(state)
    except (FinTSClientError, KeyError) as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            return _run(None)
        raise


def fetch_transactions(creds: BankCredentials, days: int, tan: str | None, iban: str | None) -> dict[str, Any]:
    def _run(from_data: bytes | None, tan_value: str | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)
        all_columns, transactions, balances = set(), [], []
        end = datetime.date.today()

        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, tan_value)
                tan_value = None
            save_state(client, creds)

            # track the earliest start_date used across accounts for the returned range
            min_start_date: datetime.date | None = None
            for account in [a for a in client.get_sepa_accounts() if not iban or a.iban == iban]:
                try:
                    bal_obj = client.get_balance(account)
                    bal_amt = getattr(bal_obj, "amount", None)
                    balances.append({
                        "iban": account.iban,
                        "amount": to_decimal_or_none(getattr(bal_amt, "amount", bal_amt)),
                        "currency": getattr(bal_amt, "currency", None),
                        "date": to_jsonable(getattr(bal_obj, "date", None)),
                    })
                except Exception:
                    logging.exception("FinTS balance fetch failed for IBAN=%s", account.iban)

                # Determine per-account start date: if `days` provided use it, otherwise
                # compute start from the latest local transaction for this IBAN.
                if days is not None:
                    start_date = datetime.date.today() - datetime.timedelta(days=days)
                else:
                    # Try to find latest local transaction for this account
                    filtered_rows = fetch_local_transactions(days=MAX_DAYS, account_iban=account.iban)
                    if filtered_rows:
                        cand = filtered_rows[0].get("entry_date") or filtered_rows[0].get("date")
                        latest_date = None
                        if cand:
                            try:
                                latest_date = datetime.datetime.strptime(str(cand), "%d.%m.%Y").date()
                            except ValueError:
                                try:
                                    latest_date = datetime.date.fromisoformat(str(cand).split("T", 1)[0])
                                except ValueError:
                                    latest_date = None

                        if latest_date is not None:
                            # fetch from the latest known date to today (inclusive)
                            start_date = latest_date
                        else:
                            start_date = datetime.date.today() - datetime.timedelta(days=INITIAL_SYNC_DAYS)
                    else:
                        start_date = datetime.date.today() - datetime.timedelta(days=INITIAL_SYNC_DAYS)

                result = client.get_transactions(account, start_date=start_date, end_date=end)

                # update min_start_date
                if start_date is not None:
                    if min_start_date is None or start_date < min_start_date:
                        min_start_date = start_date

                if isinstance(result, NeedTANResponse):
                    result = resolve_tan_until_done(client, result, tan_value)
                    tan_value = None

                for item in result:
                    # Sicherstellen, dass wir an das zugrunde liegende data-Dict herankommen
                    data = item.data if hasattr(item, "data") and isinstance(item.data, dict) else {}

                    # Betrag & Währung sicher aus dem FinTS-Objekt parsen
                    amount_obj = data.get("amount")
                    amount_val = 0.0
                    currency_val = "EUR"
                    if amount_obj is not None:
                        amount_val = float(getattr(amount_obj, "amount", 0) or 0)
                        currency_val = str(getattr(amount_obj, "currency", "EUR") or "EUR")

                    # Originalen Betrag extrahieren, falls vorhanden
                    orig_amount_obj = data.get("original_amount")
                    orig_amount_val = ""
                    if orig_amount_obj is not None:
                        # Wenn es ein FinTS Amount-Objekt ist, Wert holen, sonst als String mitschreiben
                        orig_amount_val = str(getattr(orig_amount_obj, "amount", orig_amount_obj) or "")

                    # 🚨 Hier werden nun die ISO-Timestamps berechnet, damit to_row_payload() sie parsen kann
                    raw_date = data.get("date") or ""
                    raw_entry_date = data.get("entry_date") or ""

                    transaction_data = {
                        "status":                         str(data.get("status") or ""),
                        "funds_code":                     str(data.get("funds_code") or ""),
                        "id":                             str(data.get("id") or ""),
                        "customer_reference":             str(data.get("customer_reference") or ""),
                        "bank_reference":                 str(data.get("bank_reference") or ""),
                        "extra_details":                 str(data.get("extra_details") or ""),
                        
                        # Datumsfelder & neu generierte TS-Felder
                        "date":                           str(raw_date),
                        "entry_date":                     str(raw_entry_date),
                        "guessed_entry_date":             str(data.get("guessed_entry_date") or ""),
                        
                        "transaction_reference":         str(data.get("transaction_reference") or ""),
                        "transaction_code":               str(data.get("transaction_code") or ""),
                        "posting_text":                   str(data.get("posting_text") or ""),
                        "prima_nota":                     str(data.get("prima_nota") or ""),
                        "purpose":                        str(data.get("purpose") or ""),
                        
                        # Tippfehler gefixt: "applicant_bin" -> "applicant_bic"
                        "applicant_bic":                  str(data.get("applicant_bic") or data.get("applicant_bin") or ""),
                        "applicant_iban":                 str(data.get("applicant_iban") or ""),
                        "applicant_name":                 str(data.get("applicant_name") or ""),
                        "return_debit_notes":             str(data.get("return_debit_notes") or ""),
                        "recipient_name":                 str(data.get("recipient_name") or ""),
                        
                        # Tippfehler gefixt: "dadditional_purposeate" -> "additional_purpose"
                        "additional_purpose":             str(data.get("additional_purpose") or ""),
                        "gvc_applicant_iban":             str(data.get("gvc_applicant_iban") or ""),
                        "gvc_applicant_bic":              str(data.get("gvc_applicant_bic") or data.get("gvc_applicant_bin") or ""),
                        
                        # Tippfehler gefixt: "dend_to_end_referenceate" -> "end_to_end_reference"
                        "end_to_end_reference":           str(data.get("end_to_end_reference") or ""),
                        "additional_position_reference":  str(data.get("additional_position_reference") or ""),
                        "applicant_creditor_id":          str(data.get("applicant_creditor_id") or ""),
                        "purpose_code":                   str(data.get("purpose_code") or ""),
                        "additional_position_date":      str(data.get("additional_position_date") or ""),
                        "deviate_applicant":              str(data.get("deviate_applicant") or ""),
                        "deviate_recipient":              str(data.get("deviate_recipient") or ""),
                        "FRST_ONE_OFF_RECC":              str(data.get("FRST_ONE_OFF_RECC") or ""),
                        "old_SEPA_CI":                    str(data.get("old_SEPA_CI") or ""),
                        "old_SEPA_additional_position_reference": str(data.get("old_SEPA_additional_position_reference") or ""),
                        "settlement_tag":                 str(data.get("settlement_tag") or ""),
                        "debitor_identifier":             str(data.get("debitor_identifier") or ""),
                        "compensation_amount":            str(data.get("compensation_amount") or ""),
                        
                        # Beträge
                        "original_amount":                orig_amount_val,
                        "amount":                         amount_val,
                        "currency":                       currency_val,
                    }

                    transactions.append({
                        "account": {
                            "iban": account.iban,
                            "bic":   account.bic,
                            "accountnumber": account.accountnumber,
                            "subaccount": account.subaccount,
                            "blz": account.blz,
                        },
                        "date": transaction_data["date"],
                        "data": transaction_data,
                    })

            # determine overall start for the returned range
            if days is not None:
                overall_start = datetime.date.today() - datetime.timedelta(days=days)
            else:
                overall_start = min_start_date or (datetime.date.today() - datetime.timedelta(days=INITIAL_SYNC_DAYS))

            return {
                "range": {"start": str(overall_start), "end": str(end), "days": days},
                "balances": balances, "all_columns": sorted(all_columns),
                "count": len(transactions), "transactions": transactions,
            }

    state = load_state(creds)
    try:
        return _run(state, tan)
    except (FinTSClientError, KeyError) as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            return _run(None, tan)
        raise


def fetch_account_balance(creds: BankCredentials, iban: str) -> dict[str, Any]:
    normalized_iban = normalize_text(iban).lower()

    def _run(from_data: bytes | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)

        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, None)
            save_state(client, creds)

            account = next(
                (
                    item
                    for item in client.get_sepa_accounts()
                    if normalize_text(getattr(item, "iban", "")).lower() == normalized_iban
                ),
                None,
            )
            if account is None:
                raise HTTPException(status_code=404, detail="Kein passendes Konto gefunden")

            balance = client.get_balance(account)
            balance_amount = getattr(balance, "amount", None)
            amount = to_decimal_or_none(getattr(balance_amount, "amount", balance_amount))
            if amount is None:
                raise HTTPException(status_code=502, detail="Kontostand konnte nicht gelesen werden.")

            return {
                "iban": account.iban,
                "amount": amount,
                "currency": getattr(balance_amount, "currency", None) or getattr(account, "currency", None) or "EUR",
                "date": to_jsonable(getattr(balance, "date", None)),
            }

    state = load_state(creds)
    try:
        return _run(state)
    except (FinTSClientError, KeyError) as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            return _run(None)
        raise


def _update_sync_state(scope: str, status: str, message: str | None = None) -> None:
    with _sync_status_lock:
        found = False
        for entry in _sync_state["progress"]:
            if entry.get("scope") == scope:
                entry["status"] = status
                entry["message"] = message
                found = True
                break
        if not found:
            _sync_state["progress"].append({"scope": scope, "status": status, "message": message})
        _sync_state["current"] = next((e["scope"] for e in _sync_state["progress"] if e["status"] == "running"), None)


def _sync_all_worker(days: int | None = None) -> None:
    creds_list = list_bank_credentials()
    with _sync_status_lock:
        _sync_state["progress"] = []
        _sync_state["current"] = None
        _sync_state["last_run"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for stored in creds_list:
        scope = stored.get("scope") or "unknown"
        try:
            _update_sync_state(scope, "queued", None)
            creds = BankCredentials.model_validate(stored)
            _update_sync_state(scope, "running", None)
            # perform fetch for this credentials set
            try:
                payload = fetch_transactions(creds, days=days if days is not None else resolve_auto_sync_days(None), tan=None, iban=None)
                try:
                    store_transactions_in_local_db(payload.get("transactions", []))
                except Exception:
                    logging.exception("Lokale DB Sync failed for %s", scope)
                _update_sync_state(scope, "done", None)
            except Exception as err:
                logging.exception("Sync failed for %s", scope)
                _update_sync_state(scope, "error", str(err))
        except Exception:
            logging.exception("Preparing sync failed for %s", scope)
            _update_sync_state(scope, "error", "preparation failed")

    with _sync_status_lock:
        _sync_state["current"] = None


@router.post("/transactions/sync_all")
def start_sync_all(request: TransactionsRequest) -> dict[str, Any]:
    try:
        days = request.days
        # start background thread that syncs all stored credentials sequentially
        thread = threading.Thread(target=_sync_all_worker, args=(days,), daemon=True)
        thread.start()
        return {"status": "started", "queued": True}
    except Exception as err:
        logging.exception("Failed to start sync_all")
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/transactions/sync_status")
def get_sync_status() -> dict[str, Any]:
    with _sync_status_lock:
        return dict(_sync_state)


def send_transfer(req: TransferRequest) -> dict[str, Any]:
    creds = resolve_bank_credentials(req.credentials)

    def _run(from_data: bytes | None, tan_value: str | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)
        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, tan_value)
                tan_value = None
            save_state(client, creds)

            accounts = [a for a in client.get_sepa_accounts() if not req.sender_iban or a.iban == req.sender_iban]
            if not accounts: raise HTTPException(status_code=404, detail="Kein passendes Absenderkonto gefunden")
            
            sender_account = accounts[0]
            result = client.simple_sepa_transfer(
                account=sender_account, iban=req.recipient_iban, bic=req.recipient_bic or "",
                recipient_name=req.recipient_name, amount=req.amount,
                account_name=req.sender_name,
                reason=req.reason, endtoend_id="NOTPROVIDED"
            )

            needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
            while isinstance(result, NeedTANResponse) or needs_vop:
                if NeedVOPResponse is not None and isinstance(result, NeedVOPResponse):
                    result = client.approve_vop_response(cast(Any, result))
                    needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
                    continue
                result = resolve_tan_until_done(client, result, tan_value)
                tan_value = None
                needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)

            validate_transfer_result(result)
        save_state(client, creds)
        return {
            "status": "ok", "sender_iban": sender_account.iban, "recipient_iban": req.recipient_iban,
            "recipient_name": req.recipient_name, "amount": str(req.amount), "reason": req.reason
        }
    state = load_state(creds)
    try:
        return _run(state, req.tan)
    except (FinTSClientError, KeyError) as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            return _run(None, req.tan)
        raise

# --- FastAPI Endpoints ---

@router.post("/accounts")
def get_accounts(request: AccountsRequest) -> dict[str, Any]:
    try:
        if request.credentials is not None:
            credentials = resolve_bank_connection_details(request.credentials)
        else:
            credentials = resolve_bank_credentials(None)
        return fetch_accounts(credentials)
    except FinTSClientError as err: raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")

@router.post("/transactions")
def get_transactions(request: TransactionsRequest) -> dict[str, Any]:
    try:
        credentials = resolve_bank_credentials(request.credentials, request.scope)
        effective_days = (
            request.days
            if request.days is not None
            else resolve_auto_sync_days(request.iban)
        )
        cache_key = build_transactions_cache_key(credentials.username, days=effective_days, iban=request.iban)
        synced_count, sync_error, rows_error = 0, None, None

        if request.tan is None:
            cached_payload = get_cached_transactions(cache_key)
            if cached_payload is not None:
                try:
                    rows = list_transactions_from_local_db(days=None, iban=request.iban)
                except Exception as err:
                    logging.exception("Lokale DB-Lesung fehlgeschlagen")
                    rows_error, rows = str(err), []
                return {
                    **cached_payload,
                    "cached": True,
                    "rows": rows,
                    "rows_count": len(rows),
                    "synced_count": 0,
                    "local_db_enabled": True,
                    "local_db_sync_error": None,
                    "local_db_rows_error": rows_error,
                }

        payload = fetch_transactions(credentials, days=effective_days, tan=request.tan, iban=request.iban)
        try:
            synced_count = store_transactions_in_local_db(
                payload.get("transactions", []),
            )
        except Exception as err:
            logging.exception("Lokale DB-Synchronisation fehlgeschlagen")
            sync_error = str(err)
        set_cached_transactions(cache_key, payload)

        try:
            rows = list_transactions_from_local_db(days=None, iban=request.iban)
        except Exception as err:
            logging.exception("Lokale DB-Lesung fehlgeschlagen")
            rows_error, rows = str(err), []

        return {
            **payload,
            "cached": False,
            "rows": rows,
            "rows_count": len(rows),
            "synced_count": synced_count,
            "local_db_enabled": True,
            "local_db_sync_error": sync_error,
            "local_db_rows_error": rows_error,
        }
    except TanRequired as err: raise HTTPException(status_code=409, detail={"code": "TAN_REQUIRED", "challenge": err.challenge, "decoupled": err.decoupled})
    except TanTimeout as err: raise HTTPException(status_code=408, detail=str(err))
    except FinTSClientError as err: raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")

@router.post("/transfer")
def create_transfer(request: TransferRequest) -> dict[str, Any]:
    try: return send_transfer(request)
    except TanRequired as err: raise HTTPException(status_code=409, detail={"code": "TAN_REQUIRED", "challenge": err.challenge, "decoupled": err.decoupled})
    except TanTimeout as err: raise HTTPException(status_code=408, detail=str(err))
    except FinTSClientError as err: raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")