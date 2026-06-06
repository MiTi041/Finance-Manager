from __future__ import annotations

from typing import Any

from finance_server.db import (
    delete_transaction,
    delete_transactions_batch,
    fetch_latest_transaction,
    fetch_transactions,
    insert_transactions,
    update_transaction_category,
    update_transaction_note,
    update_transactions_category_batch,
)


class TransactionService:
    def get_transactions(
        self,
        days: int = 36500,
        iban: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        return fetch_transactions(
            days=days,
            account_iban=iban,
            from_date=from_date,
            to_date=to_date,
        )

    def get_latest_transaction(
        self,
        iban: str | None = None,
        blz: str | None = None,
    ) -> dict[str, Any] | None:
        return fetch_latest_transaction(iban=iban, account_blz=blz)

    def import_transactions(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        return insert_transactions(rows)

    def delete_transaction(self, transaction_id: int) -> bool:
        return delete_transaction(transaction_id)

    def delete_transactions_batch(self, transaction_ids: list[int]) -> int:
        return delete_transactions_batch(transaction_ids)

    def update_note(self, transaction_id: int, note: str | None) -> bool:
        return update_transaction_note(transaction_id, note)

    def update_category(
        self, transaction_id: int, category_id: int | None
    ) -> None:
        update_transaction_category(transaction_id, category_id)

    def update_categories_batch(
        self, transaction_ids: list[int], category_id: int | None
    ) -> int:
        return update_transactions_category_batch(transaction_ids, category_id)
