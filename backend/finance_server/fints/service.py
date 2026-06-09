from __future__ import annotations

from typing import Any

from finance_server.models.fints import TransferRequest

from .accounts import fetch_accounts
from .transactions import fetch_and_store_transactions
from .balance import fetch_account_balance
from .transfer import send_transfer
from .sync import sync_all_worker
from .client import get_product_id, set_product_id


class FintsService:
    def fetch_accounts(self, credentials) -> dict[str, Any]:
        return fetch_accounts(credentials)

    def fetch_transactions(
        self, credentials, days: int, tan: str | None, iban: str | None, scope: str | None = None
    ) -> dict[str, Any]:
        return fetch_and_store_transactions(credentials, days, tan, iban, scope)

    def fetch_balance(self, credentials, iban: str) -> dict[str, Any]:
        return fetch_account_balance(credentials, iban)

    def send_transfer(self, req: TransferRequest) -> dict[str, Any]:
        return send_transfer(req)

    def sync_all(self, days: int | None = None) -> None:
        sync_all_worker(days)

    def get_product_id(self) -> str | None:
        return get_product_id()

    def set_product_id(self, value: str | None) -> None:
        set_product_id(value)
