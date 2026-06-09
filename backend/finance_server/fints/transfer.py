from typing import Any, cast

from fints.client import NeedTANResponse
from fints.exceptions import FinTSClientError
import fints.formals as fints_formals

from finance_server.models.fints import TransferRequest

from .common import TanRequired, TanTimeout
from .client import (
    resolve_bank_credentials, with_state_retry, make_client,
    bootstrap_client, save_state, resolve_tan_until_done, validate_transfer_result,
)

NeedVOPResponse = getattr(fints_formals, "NeedVOPResponse", None)


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
            if not accounts:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Kein passendes Absenderkonto gefunden")

            sender_account = accounts[0]
            result = client.simple_sepa_transfer(
                account=sender_account, iban=req.recipient_iban, bic=req.recipient_bic or "",
                recipient_name=req.recipient_name, amount=req.amount,
                account_name=req.sender_name,
                reason=req.reason, endtoend_id="NOTPROVIDED",
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
            "recipient_name": req.recipient_name, "amount": str(req.amount), "reason": req.reason,
        }

    return with_state_retry(creds, _run, req.tan)
