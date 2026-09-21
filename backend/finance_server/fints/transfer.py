import base64
import datetime
import logging
from typing import Any, cast

from finance_server.db import find_bank_account_by_iban, load_bank_credentials_by_iban
from finance_server.db.utils import normalize_text
from finance_server.models.fints import TransferRequest
from fints.client import NeedRetryResponse, NeedTANResponse, NeedVOPResponse
from fints.exceptions import FinTSClientError

from .banks import get_bank_definition
from .client import (
    _capture_tan_medium_from_challenge,
    bootstrap_client,
    clear_state_files_for_creds,
    load_state,
    make_client,
    resolve_bank_credentials,
    resolve_tan_until_done,
    save_state,
    should_retry_without_state,
    validate_transfer_result,
)
from .common import VopConfirmationRequired
from .vop_store import delete_pending_vop, load_pending_vop, save_pending_vop


def _resolve_holder_name(iban: str) -> str | None:
    account = find_bank_account_by_iban(iban)
    if account is None:
        return None
    return (account.get("holder_name") or "").strip() or None


def _bank_supports_instant(bank_key: str | None) -> bool:
    if not bank_key:
        return True
    try:
        return get_bank_definition(bank_key).sepa_express
    except KeyError:
        return True


def _recipient_bank_key(recipient_iban: str) -> str | None:
    """Nur verknüpfte eigene Konten sind auflösbar; externe Empfänger gelten als Instant-fähig."""
    creds = load_bank_credentials_by_iban(recipient_iban)
    if not creds:
        return None
    return creds.get("bank_key")


def _send_prepare(client, sender_iban: str):
    """Login/Sync war bereits durch _prepare erledigt; hier wird nur noch das
    Absenderkonto aufgelöst."""
    accounts = client.get_sepa_accounts()
    selected_accounts = [a for a in accounts if not sender_iban or a.iban == sender_iban]
    if not selected_accounts:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Kein passendes Absenderkonto gefunden")

    return selected_accounts[0]


def _vop_warning_payload(challenge, req: TransferRequest, token: str) -> VopConfirmationRequired:
    vop_seg = getattr(challenge, "vop_result", None)
    single = getattr(vop_seg, "vop_single_result", None)
    result = getattr(single, "result", None)
    close_match_name = getattr(single, "close_match_name", None)
    other_identification = getattr(single, "other_identification", None)
    notice = getattr(vop_seg, "manual_authorization_notice", None)

    return VopConfirmationRequired(
        vop_token=token,
        result=str(result) if result is not None else None,
        recipient_iban=req.recipient_iban,
        recipient_name=req.recipient_name,
        close_match_name=str(close_match_name) if close_match_name else None,
        other_identification=str(other_identification) if other_identification else None,
        notice=str(notice) if notice else None,
    )


def _record_manual_recipient_income(
    req: TransferRequest, sender_iban: str, sender_holder: str | None
) -> None:
    """Spiegelt eine erfolgreiche Überweisung als Einnahme auf dem manuellen Empfängerkonto."""
    creds = load_bank_credentials_by_iban(req.recipient_iban)
    if not creds or normalize_text(creds.get("bank_key")).lower() != "manual":
        return

    from finance_server.services.transaction_service import TransactionService

    TransactionService().create_manual_transaction(
        account_iban=req.recipient_iban,
        date=datetime.date.today().isoformat(),
        amount=float(req.amount),
        recipient_name=sender_holder or req.sender_name,
        recipient_iban=sender_iban,
        purpose=req.reason,
    )


def send_transfer(req: TransferRequest) -> dict[str, Any]:
    creds = resolve_bank_credentials(req.credentials, sender_iban=req.sender_iban or None)

    # Echtzeit nur, wenn Absender- UND (eigene) Empfängerbank SEPA-Instant können.
    if not _bank_supports_instant(getattr(creds, "bank_key", None)) or not _bank_supports_instant(
        _recipient_bank_key(req.recipient_iban)
    ):
        req.instant_payment = False

    def _prepare(from_data: bytes | None, tan_value: str | None):
        """Nur Login/Sync + TAN für den Login. Kein Transfer hier."""
        client = make_client(creds, from_data)
        bootstrap_client(client)
        client.__enter__()
        try:
            while isinstance(client.init_tan_response, NeedTANResponse):
                _capture_tan_medium_from_challenge(client)
                client.init_tan_response = resolve_tan_until_done(
                    client, client.init_tan_response, tan_value
                )
                tan_value = None
            save_state(client, creds)
        except Exception:
            client.__exit__(None, None, None)
            raise
        return client

    # Retry ist hier OK: es wurde noch KEIN Zahlungsauftrag gesendet.
    state = load_state(creds)
    try:
        client = _prepare(state, req.tan)
    except FinTSClientError as err:
        if state is not None and should_retry_without_state(err):
            clear_state_files_for_creds(creds)
            client = _prepare(None, req.tan)
        else:
            raise

    tan_value = req.tan

    # Ab hier: KEIN automatischer Retry mehr, egal was passiert.
    try:
        sender_account = _send_prepare(client, req.sender_iban or "")

        stored_sender = find_bank_account_by_iban(sender_account.iban)
        if stored_sender and stored_sender.get("can_transfer") is False:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "SENDER_TRANSFER_NOT_SUPPORTED",
                    "message": "Dieses Konto unterstützt keine Überweisungen.",
                },
            )

        if req.vop_token:
            # Nutzer hat den Namens-Mismatch bestätigt → ursprünglichen Auftrag
            # (gleiche VOP-ID / derselbe command_seg) autorisieren. Der Token
            # bleibt bis zum Erfolg erhalten, damit ein erneuter Versuch mit TAN
            # (nach 409 TAN_REQUIRED) denselben Auftrag fortsetzen kann.
            record = load_pending_vop(req.vop_token)
            if record is None:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "VOP_TOKEN_EXPIRED",
                        "message": "Die VOP-Bestätigung ist abgelaufen. Bitte erneut versuchen.",
                    },
                )
            recorded_sender = (record.get("sender_iban") or "").strip().upper()
            if recorded_sender and sender_account.iban.upper() != recorded_sender:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "VOP_TOKEN_MISMATCH",
                        "message": "Bestätigung passt nicht zum Auftrag.",
                    },
                )
            blob = base64.b64decode(record["blob_b64"].encode("ascii"))
            challenge = NeedRetryResponse.from_data(blob)
            result = client.approve_vop_response(cast(Any, challenge))
        else:
            effective_recipient_name = (
                _resolve_holder_name(req.recipient_iban) or req.recipient_name
            )
            sender_holder = _resolve_holder_name(sender_account.iban)
            result = client.simple_sepa_transfer(
                account=sender_account, iban=req.recipient_iban, bic=req.recipient_bic or "",
                recipient_name=effective_recipient_name, amount=req.amount,
                account_name=sender_holder or req.sender_name,
                reason=f"{req.reason} {datetime.datetime.now():%d.%m.%Y %H:%M:%S}",
                instant_payment=req.instant_payment, endtoend_id="NOTPROVIDED",
            )

        while isinstance(result, NeedVOPResponse) or isinstance(result, NeedTANResponse):
            if isinstance(result, NeedVOPResponse):
                single = getattr(getattr(result, "vop_result", None), "vop_single_result", None)
                result_code = getattr(single, "result", None)
                if result_code == "RCVC":
                    # Name passt vollständig → automatisch weiter mit Freigabe.
                    result = client.approve_vop_response(result)
                    continue
                # Abweichung: erst explizit durch den Nutzer bestätigen lassen.
                token = save_pending_vop(
                    result.get_data(),
                    scope_key=f"{creds.bank_key}:{creds.username}",
                    sender_iban=sender_account.iban,
                )
                raise _vop_warning_payload(result, req, token)

            _capture_tan_medium_from_challenge(client, result)
            result = resolve_tan_until_done(client, result, tan_value)
            tan_value = None

        validate_transfer_result(result)
        if req.vop_token:
            delete_pending_vop(req.vop_token)
        save_state(client, creds)

        try:
            _record_manual_recipient_income(
                req, sender_account.iban, _resolve_holder_name(sender_account.iban)
            )
        except Exception:
            # Überweisung ist bereits raus — Fehler hier darf sie nicht als fehlgeschlagen melden.
            logging.exception(
                "Einnahme für manuelles Konto %s konnte nicht angelegt werden",
                req.recipient_iban,
            )

        return {
            "status": "ok",
            "sender_iban": sender_account.iban,
            "recipient_iban": req.recipient_iban,
            "recipient_name": req.recipient_name,
            "amount": str(req.amount),
            "reason": req.reason,
        }
    except FinTSClientError:
        # NICHT automatisch retryen — Nutzer/Log klar informieren,
        # dass evtl. schon ein Auftrag draußen ist, und manuell prüfen lassen.
        raise
    finally:
        client.__exit__(None, None, None)
