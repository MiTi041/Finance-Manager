import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable

from fints.client import FinTS3PinTanClient, NeedTANResponse, TransactionResponse
from fints.exceptions import FinTSClientError, FinTSConnectionError
from fints.utils import minimal_interactive_cli_bootstrap

from finance_server.core.config import settings
from finance_server.db import get_setting, set_setting, save_bank_credentials, load_bank_credentials, load_bank_credentials_by_iban
from finance_server.models.bank import BankCredentials
from finance_server.fints.banks import get_bank_definition
from finance_server.fints.common import (
    BASE_DIR, WORKSPACE_DIR, STATE_FILE,
    TanRequired, TanTimeout, BankLoginRejected,
)

try:
    from fints.hhd.flicker import terminal_flicker_unix
except ImportError:
    terminal_flicker_unix = None

_state_file_lock = threading.Lock()

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
    sender_iban: str | None = None,
) -> BankCredentials:
    if provided is not None:
        save_bank_credentials(provided.model_dump())
        return provided

    if sender_iban:
        stored = load_bank_credentials_by_iban(sender_iban)
        if stored:
            return BankCredentials.model_validate(stored)

    stored = load_bank_credentials(scope)
    if stored is None:
        from fastapi import HTTPException
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
        tan_medium=credentials.tan_medium,
    )


def get_state_file_paths() -> list[Path]:
    configured_state = settings.fints_state_file
    if configured_state:
        configured_path = Path(configured_state)
        primary = configured_path if configured_path.is_absolute() else (WORKSPACE_DIR / configured_path)
    elif settings.vercel:
        primary = Path("/tmp/.fints_state")
    else:
        primary = STATE_FILE

    paths = [primary]
    return paths


def get_state_file_paths_for_creds(creds: BankCredentials) -> list[Path]:
    configured_state = settings.fints_state_file
    if configured_state:
        configured_path = Path(configured_state)
        primary = configured_path if configured_path.is_absolute() else (WORKSPACE_DIR / configured_path)
    elif settings.vercel:
        primary = Path(f"/tmp/.fints_state_{creds.bank_key}_{creds.username}")
    else:
        primary = STATE_FILE.parent / f".fints_state_{creds.bank_key}_{creds.username}"

    paths = [primary]
    return paths


def load_state(creds=None):
       paths = get_state_file_paths_for_creds(creds) if creds else get_state_file_paths()
       primary, *fallbacks = paths
       if primary.exists():
           return primary.read_bytes()
       for fb in fallbacks:
           if fb.exists():
               data = fb.read_bytes()
               # einmalig migrieren, danach nicht mehr als Fallback nutzen
               primary.write_bytes(data)
               fb.unlink(missing_ok=True)
               return data
       return None


def save_state(client: FinTS3PinTanClient, creds: BankCredentials | None = None) -> None:
    state_blob = client.deconstruct(including_private=True)
    paths = get_state_file_paths_for_creds(creds) if creds is not None else get_state_file_paths()
    with _state_file_lock:
        for path in paths:
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(state_blob)
                return
            except OSError:
                logging.warning("Failed to write state file: %s", path)
                continue


def clear_state_files_for_creds(creds: BankCredentials | None = None) -> None:
    paths = get_state_file_paths_for_creds(creds) if creds is not None else get_state_file_paths()
    with _state_file_lock:
        for path in paths:
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                logging.warning("Failed to clear state file: %s", path)


def with_state_retry(
    creds: BankCredentials,
    run_fn: Callable[..., dict[str, Any]],
    *args: Any,
    **kwargs: Any,
) -> dict[str, Any]:
    state = load_state(creds)
    try:
        return run_fn(state, *args, **kwargs)
    except FinTSClientError as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            return run_fn(None, *args, **kwargs)
        raise
    except FinTSConnectionError as err:
        # Transportfehler (z. B. Bank schliesst die Verbindung ohne Antwort).
        # Einmalig mit frischem Dialog/State wiederholen.
        logging.warning("FinTS transport error, retrying with fresh state: %s", err)
        clear_state_files_for_creds(creds)
        return run_fn(None, *args, **kwargs)


def should_retry_without_state(err: Exception) -> bool:
    message = str(err).lower()
    return (
        "could not fetch bpd" in message
        or "dialog initialization" in message
        or "unknown tan mechanism" in message
        or "fintec error 999" in message
    )


def _collect_bank_feedback(client: FinTS3PinTanClient) -> list[tuple[str, str]]:
    """Extrahiert Rückmeldungscodes/-texte aus den letzten Bank-Antworten."""
    history = getattr(getattr(client, "connection", None), "_finance_responses", None)
    if not isinstance(history, list):
        return []

    feedback: list[tuple[str, str]] = []
    for message in history:
        try:
            for seg in message.find_segments(("HIRMG", "HIRMS")):
                for response in getattr(seg, "responses", []):
                    code = str(getattr(response, "code", "") or "")
                    text = str(getattr(response, "text", "") or "")
                    if code:
                        feedback.append((code, text))
        except Exception:
            continue
    return feedback


def _bootstrap_with_forced_tan_mechanism(
    client: FinTS3PinTanClient, mechanism: str, medium: str | None = None
) -> None:
    """Wie minimal_interactive_cli_bootstrap, erzwingt aber den angegebenen
    TAN-Mechanismus, nachdem die Bank die verfügbaren Mechanismen gemeldet hat.

    Norisbank (BestSign-Push, 921) verlangt den Namen des registrierten
    TAN-Mediums (HKTAB ohne SCA nicht abrufbar). Ist kein fester Medium-Name
    hinterlegt, wird das Medium leer gelassen (wie beim PushTAN-Workaround
    der Sparkasse in python-fints).
    """
    if not client.get_tan_mechanisms():
        client.fetch_tan_mechanisms()

    if mechanism not in client.get_tan_mechanisms():
        minimal_interactive_cli_bootstrap(client)
        return

    client.set_tan_mechanism(mechanism)
    if client.is_tan_media_required():
        if medium:
            client.selected_tan_medium = medium
        elif client.selected_tan_medium is None:
            client.selected_tan_medium = ""


def _forced_tan_mechanism(client: FinTS3PinTanClient) -> str | None:
    forced = getattr(client, "_finance_force_tan_mechanism", None)
    return forced if isinstance(forced, str) and forced else None


def _forced_tan_medium(client: FinTS3PinTanClient) -> str | None:
    medium = getattr(client, "_finance_force_tan_medium", None)
    return medium if isinstance(medium, str) and medium else None


def _capture_tan_medium_from_challenge(
    client: FinTS3PinTanClient, response: Any | None = None
) -> None:
    """Übernimmt den vom Institut im HITAN-Challenge genannten TAN-Medium-Namen
    in den Client-State, damit spätere Requests das korrekte Medium senden.
    """
    if client.selected_tan_medium:
        return
    if response is None:
        response = getattr(client, "init_tan_response", None)
    if response is None:
        return
    name = getattr(getattr(response, "tan_request", None), "tan_medium_name", None)
    if name:
        client.selected_tan_medium = name


def bootstrap_client(client: FinTS3PinTanClient) -> None:
    try:
        forced = _forced_tan_mechanism(client)
        if forced:
            _bootstrap_with_forced_tan_mechanism(client, forced, _forced_tan_medium(client))
        else:
            minimal_interactive_cli_bootstrap(client)
        client._bootstrap_mode = False
    except ValueError as err:
        if "Could not find system_id" not in str(err):
            raise

        feedback = _collect_bank_feedback(client)
        codes = [code for code, _ in feedback]
        texts = dict(feedback)
        bank_messages = [f"{code}: {text}" for code, text in feedback if (text or "").strip()]
        bank_detail = " | ".join(bank_messages)

        if "9078" in codes:
            raise BankLoginRejected(
                "Die Bank hat die Anmeldung abgebrochen: Das FinTS-Produkt "
                f"'{client.product_name}' ist bei diesem Institut nicht registriert bzw. "
                "nicht freigeschaltet. "
                "Bitte das Produkt im Online-Banking der Bank freischalten bzw. beim "
                "Institut registrieren lassen (ggf. Support kontaktieren).",
                codes=codes,
                bank_messages=bank_messages,
            ) from err

        if "9040" in codes:
            raise BankLoginRejected(
                "Anmeldung bei der Bank fehlgeschlagen (Bankmeldung 9040 "
                "'Anmeldung fehlgeschlagen'). Bitte prüfen: "
                "1) Benutzerkennung/Kundenkennung und PIN sind korrekt. Bei Instituten "
                "der Deutsche-Bank-Gruppe (Norisbank) muss die FinTS-Kennung bzw. die "
                "neue Norisbank-ID als Benutzerkennung verwendet werden. "
                "2) Das FinTS-Produkt ist für diesen Zugang registriert bzw. freigeschaltet. "
                "3) Der Zugang ist nicht vorübergehend gesperrt.",
                codes=codes,
                bank_messages=bank_messages,
            ) from err

        detail = texts.get("9900") or bank_detail
        suffix = f" Bankmeldung: {detail}" if detail else ""
        raise BankLoginRejected(
            "Anmeldung bei der Bank fehlgeschlagen. Bitte Benutzerkennung und PIN prüfen "
            "(falsche PIN, unbekannte Kennung oder vorübergehend gesperrter Zugang)." + suffix,
            codes=codes,
            bank_messages=bank_messages,
        ) from err


def resolve_product_id() -> str:
    pid = get_product_id()
    if not pid:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PRODUCT_ID_REQUIRED",
                "message": "Keine PRODUCT_ID konfiguriert. Bitte in den Einstellungen hinterlegen.",
            },
        )
    return pid


def _record_connection_responses(client: FinTS3PinTanClient) -> None:
    connection = getattr(client, "connection", None)
    if connection is None or getattr(connection, "_finance_responses", None) is not None:
        return

    connection._finance_responses = []
    original_send = connection.send

    def _recording_send(message):
        retval = original_send(message)
        history = connection._finance_responses
        history.append(retval)
        if len(history) > 50:
            del history[:-50]
        return retval

    connection.send = _recording_send


def _require_norisbank_tan_medium(creds: BankCredentials) -> str:
    medium = (creds.tan_medium or "").strip()
    if medium:
        return medium
    from fastapi import HTTPException
    raise HTTPException(
        status_code=400,
        detail={
            "code": "NORISBANK_TAN_MEDIUM_REQUIRED",
            "message": (
                "Für die Norisbank wird der Name deines BestSign-Push-Geräts benötigt. "
                "Bitte trage ihn bei den Bankzugangsdaten unter 'TAN-Medium-Name' ein "
                "(zu finden in der Norisbank-App bzw. im Online-Banking unter TAN-Verwaltung)."
            ),
        },
    )


def _apply_bank_specific_client_config(
    client: FinTS3PinTanClient, creds: BankCredentials
) -> None:
    """Setzt institutsspezifische Client-Flags (TAN-Verfahren etc.)."""
    bank_key = creds.bank_key.strip().lower()
    if bank_key == "norisbank":
        client._finance_force_tan_mechanism = "921"
        client._finance_force_tan_medium = _require_norisbank_tan_medium(creds)
    elif bank_key == "consorsbank":
        # Consorsbank/myPrivateBank-App (Decoupled, 901) verlangt eine
        # PSD2-Login-SCA. Das HKTAN-Segment im Dialog-Init wird benoetigt; die
        # 0030/3955-Antwort kommt am HKIDN-Segment an (siehe fints/dialog.py).
        client._finance_force_tan_mechanism = "901"
        # Trotz HKKAZ:N in HIPINS lehnt Consorsbank den Umsatzabruf ohne HKTAN
        # mit 9010 "Verarbeitung nicht moeglich" ab.
        client.force_twostep_tan = {"HKKAZ"}


def make_client(creds: BankCredentials, from_data: bytes | None) -> FinTS3PinTanClient:
    bank = get_bank_definition(creds.bank_key)
    client = FinTS3PinTanClient(
        bank_identifier=bank.blz,
        user_id=creds.username,
        pin=creds.pin,
        server=bank.fints_url,
        product_id=resolve_product_id(),
        product_version='1.0.0',
        customer_id=creds.username,
        from_data=from_data,
    )
    _apply_bank_specific_client_config(client, creds)
    _record_connection_responses(client)
    return client


def validate_transfer_result(result: Any) -> None:
    if not isinstance(result, TransactionResponse):
        return
    responses = [{"code": getattr(r, "code", None), "text": getattr(r, "text", None)} for r in getattr(result, "responses", [])]
    logger = logging.getLogger("finance.fints.transfer")
    logger.info("Bank response codes: %s", responses)
    codes = {r["code"] for r in responses if r["code"]}
    if "9160" in codes:
        raise TanRequired(challenge="Erforderliche TAN fehlt.", decoupled=False)
    if any(isinstance(r["code"], str) and r["code"].startswith("9") for r in responses):
        from fastapi import HTTPException
        error_texts = [
            r["text"]
            for r in responses
            if isinstance(r["code"], str) and r["code"][:1] in ("3", "9") and r["text"]
        ]
        message = (
            "Die Überweisung wurde von der Bank abgelehnt: " + "; ".join(error_texts)
            if error_texts
            else "Die Überweisung wurde von der Bank abgelehnt."
        )
        raise HTTPException(status_code=502, detail={"code": "FINTS_TRANSFER_FAILED", "message": message, "responses": responses})


def resolve_tan(client: FinTS3PinTanClient, response: NeedTANResponse, tan: str | None) -> Any:
    if response.decoupled:
        return client.send_tan(response, "")
    if terminal_flicker_unix and getattr(response, "challenge_hhduc", None):
        try:
            terminal_flicker_unix(response.challenge_hhduc)
        except Exception:
            pass
    if tan is None:
        raise TanRequired(challenge=response.challenge, decoupled=bool(response.decoupled))
    return client.send_tan(response, tan)


def resolve_tan_until_done(
    client: FinTS3PinTanClient,
    response: NeedTANResponse,
    tan: str | None,
    max_wait_seconds: int = 90,
    poll_seconds: int = 3,
) -> Any:
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



