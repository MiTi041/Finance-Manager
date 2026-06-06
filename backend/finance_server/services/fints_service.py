from __future__ import annotations

from typing import Any

from finance_server.api.fints.accounts import fetch_accounts
from finance_server.api.fints.transactions import fetch_transactions
from finance_server.api.fints.balance import fetch_account_balance
from finance_server.api.fints.transfer import send_transfer
from finance_server.api.fints.sync import _sync_all_worker
from finance_server.api.fints.client import get_product_id, set_product_id


class FinTSService:
    def fetch_accounts(self, credentials) -> dict[str, Any]:
        return fetch_accounts(credentials)

    def fetch_transactions(
        self, credentials, days: int, tan: str | None, iban: str | None
    ) -> dict[str, Any]:
        return fetch_transactions(credentials, days, tan, iban)

    def fetch_balance(self, credentials, iban: str) -> dict[str, Any]:
        return fetch_account_balance(credentials, iban)

    def send_transfer(self, req) -> dict[str, Any]:
        return send_transfer(req)

    def sync_all(self, days: int | None = None) -> None:
        _sync_all_worker(days)

    def get_product_id(self) -> str | None:
        return get_product_id()

    def set_product_id(self, value: str | None) -> None:
        set_product_id(value)
