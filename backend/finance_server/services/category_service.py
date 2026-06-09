from __future__ import annotations

from typing import Any

from finance_server.db import (
    create_category_record,
    delete_category_record,
    list_categories,
    update_category_record,
)
from finance_server.services.auto_categorize import build_combined_predictions
from finance_server.services.auto_categorize.auto_categorize import apply_prediction as _apply_prediction


class CategoryService:
    def get_categories(self) -> list[dict[str, Any]]:
        return list_categories()

    def create_category(self, payload: dict[str, Any]) -> dict[str, Any]:
        return create_category_record(payload)

    def update_category(
        self, category_id: int, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        return update_category_record(category_id, payload)

    def delete_category(self, category_id: int) -> bool:
        return delete_category_record(category_id)

    def get_predictions(self) -> list[dict[str, Any]]:
        return build_combined_predictions()

    def apply_prediction(self, transaction_id: int, category_id: int | None) -> None:
        _apply_prediction(transaction_id, category_id)
