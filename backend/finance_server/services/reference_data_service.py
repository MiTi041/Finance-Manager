from __future__ import annotations

from typing import Any

from finance_server.db import (
    create_empfaengerkonto_record,
    create_zahlungspartner_record,
    delete_empfaengerkonto_record,
    delete_zahlungspartner_record,
    get_zahlungspartner_record,
    list_empfaengerkonten_records,
    list_iban_zahlungspartner_references,
    list_zahlungspartner_iban_mappings,
    list_zahlungspartner_records,
    update_empfaengerkonto_record,
    update_zahlungspartner_iban_mapping,
    update_zahlungspartner_record,
)


class ReferenceDataService:
    def get_iban_references(self) -> list[dict[str, Any]]:
        return list_iban_zahlungspartner_references()

    def update_iban_mapping(self, iban: str, zahlungspartner_id: int) -> bool:
        return update_zahlungspartner_iban_mapping(iban, zahlungspartner_id)

    def get_zahlungspartner(
        self, zahlungspartner_id: int
    ) -> dict[str, Any] | None:
        return get_zahlungspartner_record(zahlungspartner_id)

    def list_zahlungspartner(self) -> list[dict[str, Any]]:
        return list_zahlungspartner_records()

    def list_zahlungspartner_mappings(self) -> list[dict[str, Any]]:
        return list_zahlungspartner_iban_mappings()

    def create_zahlungspartner(
        self, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return create_zahlungspartner_record(payload)

    def update_zahlungspartner(
        self, zahlungspartner_id: int, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        return update_zahlungspartner_record(zahlungspartner_id, payload)

    def delete_zahlungspartner(self, zahlungspartner_id: int) -> bool:
        return delete_zahlungspartner_record(zahlungspartner_id)

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
