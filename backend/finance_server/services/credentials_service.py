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

        accounts = credentials.get("accounts", []) or []
        if bank:
            accounts = [
                {
                    **account,
                    "can_transfer": account.get("can_transfer")
                    if account.get("can_transfer") is not None
                    else bank.can_transfer,
                }
                for account in accounts
            ]

        return {
            "configured": True,
            "account_name": credentials.get("account_name", ""),
            "bank_key": bank.key if bank else bank_key,
            "bank_name": bank.name if bank else bank_key,
            "manual": bank_key.strip().lower() == "manual",
            "blz": bank.blz if bank else "",
            "bank_logo": bank.bank_logo if bank else "",
            "username": credentials.get("username", ""),
            "tan_medium": credentials.get("tan_medium"),
            "auto_sync": credentials.get("auto_sync", True),
            "fints_url": bank.fints_url if bank else "",
            "scope": credentials.get("scope", ""),
            "account_iban": credentials.get("account_iban", ""),
            "accounts": accounts,
        }

    def get_status(self, scope: str | None = None) -> dict[str, Any]:
        return self._public_status(load_bank_credentials(scope))

    def create(self, credentials: dict[str, Any]) -> dict[str, Any]:
        if normalize_text(credentials.get("bank_key", "")).lower() == "manual":
            scope = self._upsert_manual_accounts(
                credentials.get("accounts") or [],
                normalize_text(credentials.get("account_name")),
            )
            if scope is None:
                return {"configured": False}
            return self._public_status(load_bank_credentials(scope))

        normalized_bank_key = normalize_text(credentials["bank_key"]).lower()
        normalized_username = normalize_text(credentials["username"]).lower()
        normalized_account_name = normalize_text(credentials.get("account_name")).lower()

        for existing in list_bank_credentials():
            existing_bank_key = normalize_text(existing.get("bank_key", "")).lower()
            existing_username = normalize_text(existing.get("username", "")).lower()
            existing_account_name = normalize_text(existing.get("account_name", "")).lower()
            if (
                existing_bank_key == normalized_bank_key
                and existing_username == normalized_username
                and existing_account_name == normalized_account_name
            ):
                raise ValueError("BANK_CREDENTIALS_ALREADY_STORED")

        scope = save_bank_credentials(credentials)
        return self._public_status(load_bank_credentials(scope))

    def _manual_credentials(self) -> list[dict[str, Any]]:
        return [
            cred
            for cred in list_bank_credentials()
            if normalize_text(cred.get("bank_key", "")).lower() == "manual"
        ]

    def _upsert_manual_accounts(
        self, new_accounts: list[dict[str, Any]], fallback_name: str = ""
    ) -> str | None:
        existing = self._manual_credentials()

        # Nichts hinzuzufügen und kein manueller Zugang vorhanden -> nichts tun.
        if not new_accounts and not existing:
            return None
        # Bereits in den einen "manual"-Scope konsolidiert und nichts Neues -> nichts tun.
        if not new_accounts and len(existing) == 1 and existing[0].get("scope") == "manual":
            if existing[0].get("accounts"):
                return "manual"
            delete_bank_credentials("manual")
            return None

        merged: list[dict[str, Any]] = []
        seen: set[str] = set()
        for cred in existing:
            for account in cred.get("accounts") or []:
                iban = "".join(str(account.get("iban", "")).split())
                if not iban or iban.upper() in seen:
                    continue
                seen.add(iban.upper())
                merged.append(
                    {
                        "iban": account.get("iban"),
                        "account_name": account.get("account_name"),
                        "holder_name": account.get("holder_name"),
                        "can_transfer": False,
                    }
                )
        for account in new_accounts:
            iban = "".join(str(account.get("iban", "")).split())
            if not iban or iban.upper() in seen:
                continue
            seen.add(iban.upper())
            merged.append(
                {
                    "iban": iban,
                    "account_name": normalize_text(account.get("account_name"))
                    or fallback_name
                    or None,
                    "holder_name": normalize_text(account.get("holder_name")) or None,
                    "can_transfer": False,
                }
            )

        # Keine Konten (mehr) vorhanden -> leeren manuellen Zugang entfernen.
        if not merged:
            for cred in existing:
                delete_bank_credentials(cred.get("scope"))
            return None

        scope = save_bank_credentials(
            {
                "bank_key": "manual",
                "account_name": "Manuell",
                "username": "",
                "pin": "",
                "auto_sync": False,
                "accounts": merged,
            },
            scope="manual",
        )
        for cred in existing:
            if cred.get("scope") != scope:
                delete_bank_credentials(cred.get("scope"))
        return scope

    def list_all(self) -> dict[str, Any]:
        self._upsert_manual_accounts([])
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
        for key in ("account_name", "account_iban", "username", "bank_key", "tan_medium", "auto_sync"):
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
            holder_name=payload.get("holder_name"),
        )
        if not updated:
            return {"error": "account_not_found"}

        return self._public_status(load_bank_credentials(scope))

    def delete_account(self, scope: str, iban: str) -> dict[str, Any]:
        credentials = load_bank_credentials(scope)
        if not credentials:
            return {"error": "credentials_not_found"}

        deleted = delete_bank_account_row(scope, iban)
        if (
            normalize_text(credentials.get("bank_key", "")).lower() == "manual"
            and not list_bank_accounts(scope)
        ):
            delete_bank_credentials(scope)
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
                    "can_transfer": bank.can_transfer,
                    "needs_tan_medium_name": bank.needs_tan_medium_name,
                    "username_hint": bank.username_hint,
                }
                for bank in list_bank_definitions()
            ]
        }
