from __future__ import annotations

from typing import Any

from finance_server.db.subscription_identities import (
    create_subscription_identity as db_create,
    delete_subscription_identity as db_delete,
    get_subscription_identity,
    list_subscription_identities,
    update_subscription_identity as db_update,
)


class SubscriptionIdentityService:
    def list_all(self) -> list[dict[str, Any]]:
        return list_subscription_identities()

    def get(self, identity_id: int) -> dict[str, Any] | None:
        return get_subscription_identity(identity_id)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        return db_create(payload)

    def update(self, identity_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        return db_update(identity_id, payload)

    def delete(self, identity_id: int) -> bool:
        return db_delete(identity_id)
