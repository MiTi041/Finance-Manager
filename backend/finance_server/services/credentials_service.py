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

    @staticmethod
    def _provider_fields(bank_key: Any) -> dict[str, Any]:
        """Logo/Name eines manuellen Anbieters (z. B. Scalable) für ein Konto."""
        key = normalize_text(bank_key)
        if not key:
            return {}
        try:
            definition = get_bank_definition(key)
        except KeyError:
            return {}
        return {"bank_name": definition.name, "bank_logo": definition.bank_logo, "bank_logo_dark": definition.bank_logo_dark}

    @staticmethod
    def _has_active_accounts(scope: str) -> bool:
        return any(
            account.get("iban") and not account.get("archived", False)
            for account in list_bank_accounts(scope)
        )

    def _enforce_auto_sync_state(self, scope: str, credentials: dict[str, Any]) -> None:
        if self._has_active_accounts(scope):
            return
        credentials["auto_sync"] = False

    def _public_status(self, credentials: dict[str, Any] | None) -> dict[str, Any]:
        if not credentials:
            return {"configured": False}

        bank_key = credentials.get("bank_key", "")
        # Manuelle Anbieter (Scalable, Trade Republic, ...) tragen ihren
        # Anbieter-Schlüssel separat, damit bank_key intern "manual" bleibt.
        lookup_key = normalize_text(credentials.get("provider_key")).lower() or bank_key
        bank = None
        if lookup_key:
            try:
                bank = get_bank_definition(lookup_key)
            except KeyError:
                bank = None

        accounts = credentials.get("accounts", []) or []
        accounts = [
            {**account, **self._provider_fields(account.get("bank_key"))}
            for account in accounts
        ]
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
            "manual": bank.is_manual if bank else bank_key.strip().lower() == "manual",
            "blz": bank.blz if bank else "",
            "bank_logo": bank.bank_logo if bank else "",
            "bank_logo_dark": bank.bank_logo_dark if bank else "",
            "logo_padding": bank.logo_padding if bank else 0,
            "username": credentials.get("username", ""),
            "tan_medium": credentials.get("tan_medium"),
            "auto_sync": credentials.get("auto_sync", True),
            "fints_url": bank.fints_url if bank else "",
            "scope": credentials.get("scope", ""),
            "account_iban": credentials.get("account_iban", ""),
            "accounts": accounts,
        }

    def get_status(self, scope: str | None = None) -> dict[str, Any]:
        credentials = load_bank_credentials(scope)
        if credentials is not None:
            self._enforce_auto_sync_state(scope or credentials.get("scope", ""), credentials)
            save_bank_credentials(credentials, scope=scope or credentials.get("scope"))
            credentials = load_bank_credentials(scope)
        return self._public_status(credentials)

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
        stored_credentials = load_bank_credentials(scope)
        if stored_credentials is not None:
            self._enforce_auto_sync_state(scope, stored_credentials)
            save_bank_credentials(stored_credentials, scope=scope)
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

        # Nichts hinzuzufügen -> bestehenden manuellen Zugang unverändert lassen.
        if not new_accounts:
            return existing[0].get("scope") if existing else None

        # Neue Konten nach Anbieter gruppieren. Jeder Anbieter bekommt einen
        # eigenen Scope ("manual:<provider>"), damit die Liste pro Anbieter eine
        # eigene Karte zeigt.
        grouped: dict[str, list[dict[str, Any]]] = {}
        for account in new_accounts:
            iban = "".join(str(account.get("iban", "")).split())
            if not iban:
                continue
            provider = normalize_text(account.get("bank_key")).lower() or "manual"
            grouped.setdefault(provider, []).append(account)

        last_scope = existing[0].get("scope") if existing else None

        for provider, accounts in grouped.items():
            scope = "manual" if provider == "manual" else f"manual:{provider}"

            # Eine IBAN darf nur in einem manuellen Scope liegen, sonst wäre die
            # Kontozuordnung mehrdeutig. Bei Anbieterwechsel aus dem alten Scope
            # entfernen.
            for account in accounts:
                iban = "".join(str(account.get("iban", "")).split())
                for cred in existing:
                    other_scope = cred.get("scope")
                    if other_scope == scope:
                        continue
                    if any(
                        "".join(str(item.get("iban", "")).split()).upper() == iban.upper()
                        for item in cred.get("accounts") or []
                    ):
                        delete_bank_account_row(other_scope, iban)
                        if not list_bank_accounts(other_scope):
                            delete_bank_credentials(other_scope)

            stored = load_bank_credentials(scope)
            merged: dict[str, dict[str, Any]] = {}
            for account in (stored.get("accounts") if stored else []) or []:
                iban = "".join(str(account.get("iban", "")).split())
                if iban:
                    merged[iban.upper()] = dict(account)

            # Sender-IBAN ist fest am Anbieter hinterlegt und nicht editierbar.
            try:
                payout_iban = get_bank_definition(provider).sender_iban
            except KeyError:
                payout_iban = ""

            for account in accounts:
                iban = "".join(str(account.get("iban", "")).split())
                previous = merged.get(iban.upper(), {})
                merged[iban.upper()] = {
                    "iban": iban,
                    "account_name": normalize_text(account.get("account_name"))
                    or fallback_name
                    or previous.get("account_name")
                    or None,
                    "holder_name": normalize_text(account.get("holder_name"))
                    or previous.get("holder_name")
                    or None,
                    "bank_key": provider if provider != "manual" else previous.get("bank_key"),
                    "sender_iban": payout_iban or previous.get("sender_iban") or None,
                    "can_transfer": False,
                }

            last_scope = save_bank_credentials(
                {
                    "bank_key": "manual",
                    "provider_key": provider,
                    "account_name": "Manuell",
                    "username": "",
                    "pin": "",
                    "auto_sync": False,
                    "accounts": list(merged.values()),
                },
                scope=scope,
            )

        return last_scope

    def list_all(self) -> dict[str, Any]:
        self._upsert_manual_accounts([])
        credentials = list_bank_credentials()
        for credential in credentials:
            self._enforce_auto_sync_state(credential["scope"], credential)
            save_bank_credentials(credential, scope=credential["scope"])
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

        self._enforce_auto_sync_state(scope, credentials)
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
            sender_iban=payload.get("sender_iban"),
            archived=payload.get("archived") if "archived" in payload else None,
            exclude_from_totals=(
                payload.get("exclude_from_totals")
                if "exclude_from_totals" in payload
                else None
            ),
            **(
                {"can_transfer_override": payload["can_transfer_override"]}
                if "can_transfer_override" in payload
                else {}
            ),
        )
        if not updated:
            return {"error": "account_not_found"}

        updated_credentials = load_bank_credentials(scope)
        if updated_credentials is not None:
            self._enforce_auto_sync_state(scope, updated_credentials)
            save_bank_credentials(updated_credentials, scope=scope)

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
        else:
            updated_credentials = load_bank_credentials(scope)
            if updated_credentials is not None:
                self._enforce_auto_sync_state(scope, updated_credentials)
                save_bank_credentials(updated_credentials, scope=scope)
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
                    "bank_logo_dark": bank.bank_logo_dark,
                    "logo_padding": bank.logo_padding,
                    "can_transfer": bank.can_transfer,
                    "sender_iban": bank.sender_iban,
                    "manual": bank.is_manual,
                    "needs_tan_medium_name": bank.needs_tan_medium_name,
                    "username_hint": bank.username_hint,
                }
                for bank in list_bank_definitions()
            ]
        }
