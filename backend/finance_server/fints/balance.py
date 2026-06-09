from typing import Any

from fints.client import NeedTANResponse

from finance_server.db.utils import normalize_text
from finance_server.models.bank import BankCredentials

from .common import to_decimal_or_none, to_jsonable
from .client import (
    with_state_retry, make_client, bootstrap_client, save_state,
    resolve_tan_until_done,
)


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
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Kein passendes Konto gefunden")

            balance = client.get_balance(account)
            balance_amount = getattr(balance, "amount", None)
            amount = to_decimal_or_none(getattr(balance_amount, "amount", balance_amount))
            if amount is None:
                from fastapi import HTTPException
                raise HTTPException(status_code=502, detail="Kontostand konnte nicht gelesen werden.")

            return {
                "iban": account.iban,
                "amount": amount,
                "currency": getattr(balance_amount, "currency", None) or getattr(account, "currency", None) or "EUR",
                "date": to_jsonable(getattr(balance, "date", None)),
            }

    return with_state_retry(creds, _run)
