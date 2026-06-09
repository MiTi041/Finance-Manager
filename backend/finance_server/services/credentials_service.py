from __future__ import annotations

from typing import Any

from finance_server.fints.banks import list_bank_definitions, get_bank_definition
from finance_server.db import (
    delete_bank_credentials,
    delete_bank_account as delete_bank_account_row,
    fetch_transaction_balance,
    list_bank_credentials,
    list_bank_accounts,
    load_bank_credentials,
    update_account_balance,
    update_bank_account as update_bank_account_row,
    upsert_bank_accounts,
    save_bank_credentials,
)
from finance_server.db.utils import normalize_text
from finance_server.models.bank import BankCredentials
from finance_server.fints.service import FintsService


class CredentialsService:
    def __init__(self):
        self._fints_service = FintsService()

    def _public_status(self, credentials: dict[str, Any] | None) -> dict[str, Any]:
        if not credentials:
            return {"configured": False}

        bank_key = credentials.get("bank_key", "")
        bank = None
        if bank_key:
            try:
                bank = get_bank_definition(bank_key)
            except KeyError:
                bank = None

        return {
            "configured": True,
            "account_name": credentials.get("account_name", ""),
            "bank_key": bank.key if bank else bank_key,
            "bank_name": bank.name if bank else bank_key,
            "blz": bank.blz if bank else "",
            "bank_logo": bank.bank_logo if bank else "",
            "username": credentials.get("username", ""),
            "fints_url": bank.fints_url if bank else "",
            "scope": credentials.get("scope", ""),
            "account_iban": credentials.get("account_iban", ""),
            "accounts": credentials.get("accounts", []),
        }

    def get_status(self, scope: str | None = None) -> dict[str, Any]:
        return self._public_status(load_bank_credentials(scope))

    def create(self, credentials: dict[str, Any]) -> dict[str, Any]:
        normalized_bank_key = normalize_text(credentials["bank_key"]).lower()
        normalized_username = normalize_text(credentials["username"]).lower()

        for existing in list_bank_credentials():
            existing_bank_key = normalize_text(existing.get("bank_key", "")).lower()
            existing_username = normalize_text(existing.get("username", "")).lower()
            if existing_bank_key == normalized_bank_key and existing_username == normalized_username:
                raise ValueError("BANK_CREDENTIALS_ALREADY_STORED")

        scope = save_bank_credentials(credentials)
        return self._public_status(load_bank_credentials(scope))

    def list_all(self) -> dict[str, Any]:
        credentials = list_bank_credentials()
        return {
            "count": len(credentials),
            "credentials": [self._public_status(item) for item in credentials],
        }

    def update(self, scope: str, payload: dict[str, Any]) -> dict[str, Any]:
        credentials = load_bank_credentials(scope)
        if not credentials:
            return {"error": "credentials_not_found"}

        credentials = dict(credentials)
        for key in ("account_name", "account_iban", "username", "bank_key"):
            if key in payload:
                credentials[key] = payload[key]

        if "accounts" in payload:
            upsert_bank_accounts(scope, payload["accounts"])
            credentials["accounts"] = list_bank_accounts(scope)

        save_bank_credentials(credentials, scope=scope)
        return self._public_status(load_bank_credentials(scope))

    def delete(self, scope: str | None = None) -> dict[str, Any]:
        delete_bank_credentials(scope)
        return {"configured": False}

    def update_account(
        self, scope: str, iban: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        credentials = load_bank_credentials(scope)
        if not credentials:
            return {"error": "credentials_not_found"}

        updated = update_bank_account_row(
            scope,
            iban,
            account_name=payload.get("account_name"),
            account_iban=payload.get("account_iban"),
        )
        if not updated:
            return {"error": "account_not_found"}

        return self._public_status(load_bank_credentials(scope))

    def delete_account(self, scope: str, iban: str) -> dict[str, Any]:
        credentials = load_bank_credentials(scope)
        if not credentials:
            return {"error": "credentials_not_found"}

        deleted = delete_bank_account_row(scope, iban)
        return {"deleted": deleted}

    def adjust_balance(
        self, scope: str, iban: str
    ) -> dict[str, Any]:
        credentials = load_bank_credentials(scope)
        if not credentials:
            return {"error": "credentials_not_found"}

        account = next(
            (
                item
                for item in list_bank_accounts(scope)
                if normalize_text(item.get("iban")).lower() == normalize_text(iban).lower()
            ),
            None,
        )
        if account is None:
            return {"error": "account_not_found"}

        balance = self._fints_service.fetch_balance(
            BankCredentials.model_validate(credentials), iban
        )

        balance_amount = balance["amount"]
        transaction_sum = fetch_transaction_balance(iban)
        correction = balance_amount - transaction_sum
        update_account_balance(scope, iban, correction)

        return {"correction": correction, "bank_balance": balance_amount}

    def list_available_banks(self) -> dict[str, Any]:
        return {
            "banks": [
                {
                    "key": bank.key,
                    "name": bank.name,
                    "blz": bank.blz,
                    "fints_url": bank.fints_url,
                    "bank_logo": bank.bank_logo,
                }
                for bank in list_bank_definitions()
            ]
        }
