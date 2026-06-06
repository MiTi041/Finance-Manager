from __future__ import annotations

from typing import Any

from finance_server.db import (
    create_empfaengerkonto_record,
    create_kontoinhaber_record,
    delete_empfaengerkonto_record,
    delete_kontoinhaber_record,
    get_kontoinhaber_record,
    list_empfaengerkonten_records,
    list_iban_kontoinhaber_references,
    list_kontoinhaber_iban_mappings,
    list_kontoinhaber_records,
    update_empfaengerkonto_record,
    update_kontoinhaber_iban_mapping,
    update_kontoinhaber_record,
)


class ReferenceDataService:
    def get_iban_references(self) -> list[dict[str, Any]]:
        return list_iban_kontoinhaber_references()

    def update_iban_mapping(self, iban: str, kontoinhaber_id: int) -> bool:
        return update_kontoinhaber_iban_mapping(iban, kontoinhaber_id)

    def get_kontoinhaber(
        self, kontoinhaber_id: int
    ) -> dict[str, Any] | None:
        return get_kontoinhaber_record(kontoinhaber_id)

    def list_kontoinhaber(self) -> list[dict[str, Any]]:
        return list_kontoinhaber_records()

    def list_kontoinhaber_mappings(self) -> list[dict[str, Any]]:
        return list_kontoinhaber_iban_mappings()

    def create_kontoinhaber(
        self, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return create_kontoinhaber_record(payload)

    def update_kontoinhaber(
        self, kontoinhaber_id: int, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        return update_kontoinhaber_record(kontoinhaber_id, payload)

    def delete_kontoinhaber(self, kontoinhaber_id: int) -> bool:
        return delete_kontoinhaber_record(kontoinhaber_id)

    def get_recipient_accounts(self) -> list[dict[str, Any]]:
        return list_empfaengerkonten_records()

    def create_recipient_account(
        self, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return create_empfaengerkonto_record(payload)

    def update_recipient_account(
        self, recipient_account_id: int, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        return update_empfaengerkonto_record(recipient_account_id, payload)

    def delete_recipient_account(self, recipient_account_id: int) -> bool:
        return delete_empfaengerkonto_record(recipient_account_id)
