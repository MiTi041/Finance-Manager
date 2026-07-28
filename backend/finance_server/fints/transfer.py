from datetime import datetime
from typing import Any, cast

from fints.client import NeedTANResponse, SEPAAccount
from fints.exceptions import FinTSClientError
from fints.utils import minimal_interactive_cli_bootstrap
import fints.formals as fints_formals

from finance_server.models.fints import TransferRequest

from .client import (
    resolve_bank_credentials, make_client,
    load_state, save_state, clear_state_files_for_creds,
    should_retry_without_state,
    resolve_tan_until_done, validate_transfer_result,
)

NeedVOPResponse = getattr(fints_formals, "NeedVOPResponse", None)


def send_transfer(req: TransferRequest) -> dict[str, Any]:
    creds = resolve_bank_credentials(req.credentials, sender_iban=req.sender_iban or None)

    def _prepare(from_data: bytes | None, tan_value: str | None):
        """Nur Login/Sync + TAN für den Login. Kein Transfer hier."""
        client = make_client(creds, from_data)
        minimal_interactive_cli_bootstrap(client)
        client.__enter__()
        try:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, tan_value)
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

    # Ab hier: KEIN automatischer Retry mehr, egal was passiert.
    # ponytail: client is already entered by _prepare, so no `with client:`
    try:
        accounts = client.get_sepa_accounts()
        selected_accounts = [a for a in accounts if not req.sender_iban or a.iban == req.sender_iban]
        if not selected_accounts:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Kein passendes Absenderkonto gefunden")

        sender_account = selected_accounts[0]

        result = client.simple_sepa_transfer(
            account=sender_account, iban=req.recipient_iban, bic=req.recipient_bic or "",
            recipient_name=req.recipient_name, amount=req.amount,
            account_name=req.sender_name,
            reason=f"{req.reason} {datetime.now():%d.%m.%Y %H:%M:%S}", instant_payment=True, endtoend_id="NOTPROVIDED",
        )

        needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
        while isinstance(result, NeedTANResponse) or needs_vop:
            if NeedVOPResponse is not None and isinstance(result, NeedVOPResponse):
                result = client.approve_vop_response(cast(Any, result))
                needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
                continue
            result = resolve_tan_until_done(client, result, req.tan)
            needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)

        validate_transfer_result(result)
        save_state(client, creds)

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