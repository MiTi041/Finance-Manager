from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from finance_server.services.subscription_service import SubscriptionService
from finance_server.api.deps import get_subscription_service

router = APIRouter()


@router.get("/db/subscriptions")
def get_subscriptions(
    days: int = Query(default=36500, ge=1),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
    include_dismissed: bool = Query(default=False),
    service: SubscriptionService = Depends(get_subscription_service),
) -> dict[str, Any]:
    subscriptions = service.get_subscriptions(
        days=days,
        iban=iban,
        from_date=from_date,
        to_date=to_date,
        include_dismissed=include_dismissed,
    )
    return {
        "count": len(subscriptions),
        "subscriptions": subscriptions,
    }
