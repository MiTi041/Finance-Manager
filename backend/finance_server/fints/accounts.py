from typing import Any

from finance_server.models.bank import BankCredentials
from fints.client import NeedTANResponse

from .client import (
    _capture_tan_medium_from_challenge,
    bootstrap_client,
    make_client,
    resolve_tan_until_done,
    save_state,
    with_state_retry,
)


def _extract_account_details(client) -> tuple[dict[str, str], dict[str, str]]:
    """Liest Inhaber- und Produktnamen aus den UPD-Daten (HIUPD) der Bank.

    Liefert zwei Maps je normalisierter IBAN: holder_name und product_name.
    """
    holder_by_iban: dict[str, str] = {}
    product_by_iban: dict[str, str] = {}
    try:
        info = client.get_information()
        for acc in info.get("accounts", []):
            iban = str(acc.get("iban") or "").strip().upper()
            if not iban:
                continue
            owner = " ".join(
                str(part).strip() for part in (acc.get("owner_name") or []) if str(part).strip()
            )
            if owner:
                holder_by_iban[iban] = owner
            product = str(acc.get("product_name") or "").strip()
            if product:
                product_by_iban[iban] = product
    except Exception:
        pass
    return holder_by_iban, product_by_iban


def _store_holder_names(creds: BankCredentials, holder_by_iban: dict[str, str]) -> None:
    """Schreibt die ermittelten Inhabernamen zurück in die bank_accounts-Tabelle."""
    if not holder_by_iban:
        return
    from finance_server.db import list_bank_credentials as list_stored
    from finance_server.db import update_bank_account

    wanted_bank = (creds.bank_key or "").strip().lower()
    wanted_user = (creds.username or "").strip().lower()
    scope = None
    for stored in list_stored():
        if (stored.get("bank_key") or "").strip().lower() == wanted_bank and (
            stored.get("username") or ""
        ).strip().lower() == wanted_user:
            scope = stored.get("scope")
            break
    if not scope:
        return
    for iban, holder in holder_by_iban.items():
        try:
            update_bank_account(scope, iban, holder_name=holder)
        except Exception:
            continue


def fetch_accounts(creds: BankCredentials) -> dict[str, Any]:
    def _run(from_data: bytes | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)
        accounts = []
        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                _capture_tan_medium_from_challenge(client)
                client.init_tan_response = resolve_tan_until_done(
                    client, client.init_tan_response, None
                )
            holder_by_iban, product_by_iban = _extract_account_details(client)
            _store_holder_names(creds, holder_by_iban)
            save_state(client, creds)
            for acc in client.get_sepa_accounts():
                iban = acc.iban.upper()
                accounts.append({
                    "iban": acc.iban, "bic": acc.bic, "accountnumber": acc.accountnumber,
                    "blz": acc.blz, "currency": getattr(acc, "currency", "EUR"),
                    "holder_name": holder_by_iban.get(iban),
                    "product_name": product_by_iban.get(iban),
                })
        return {"count": len(accounts), "accounts": accounts}

    return with_state_retry(creds, _run)
