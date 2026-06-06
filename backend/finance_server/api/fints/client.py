import logging
import os
import time
from pathlib import Path
from typing import Any, Callable, cast

from fastapi import HTTPException
from fints.client import FinTS3PinTanClient, NeedTANResponse, TransactionResponse
from fints.exceptions import FinTSClientError
from fints.utils import minimal_interactive_cli_bootstrap
import fints.formals as fints_formals

from finance_server.banks import get_bank_definition
from finance_server.db import get_setting, set_setting, save_bank_credentials, load_bank_credentials
from finance_server.models import BankCredentials

from .common import (
    BASE_DIR, WORKSPACE_DIR, STATE_FILE, LEGACY_STATE_FILE,
    TanRequired, TanTimeout,
)

try:
    from fints.hhd.flicker import terminal_flicker_unix
except Exception:
    terminal_flicker_unix = None

NeedVOPResponse = getattr(fints_formals, "NeedVOPResponse", None)

_SETTINGS_KEY = "product_id"

def get_product_id() -> str | None:
    return get_setting(_SETTINGS_KEY)

def set_product_id(value: str | None) -> None:
    if value:
        set_setting(_SETTINGS_KEY, value)
        logging.info("PRODUCT_ID gespeichert")
    else:
        from finance_server.db import delete_setting as _delete
        _delete(_SETTINGS_KEY)

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

def clear_state_files_for_creds(creds: BankCredentials | None = None) -> None:
    paths = get_state_file_paths_for_creds(creds) if creds is not None else get_state_file_paths()
    for path in paths:
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass

def with_state_retry(
    creds: BankCredentials,
    run_fn: Callable[..., dict[str, Any]],
    *args: Any,
    **kwargs: Any,
) -> dict[str, Any]:
    state = load_state(creds)
    try:
        return run_fn(state, *args, **kwargs)
    except (FinTSClientError, KeyError) as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            return run_fn(None, *args, **kwargs)
        raise

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

def resolve_product_id() -> str:
    pid = get_product_id()
    if not pid:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PRODUCT_ID_REQUIRED",
                "message": "Keine PRODUCT_ID konfiguriert. Bitte in den Einstellungen hinterlegen.",
            },
        )
    return pid

def make_client(creds: BankCredentials, from_data: bytes | None) -> FinTS3PinTanClient:
    bank = get_bank_definition(creds.bank_key)
    return FinTS3PinTanClient(
        bank_identifier=bank.blz,
        user_id=creds.username,
        pin=creds.pin,
        server=bank.fints_url,
        product_id=resolve_product_id(),
        customer_id=creds.username,
        from_data=from_data,
    )

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
