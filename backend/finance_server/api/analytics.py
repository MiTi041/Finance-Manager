from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from finance_server.db.analytics import (
    fetch_summary,
    fetch_account_balances,
    fetch_category_analytics,
    fetch_partner_analytics,
)

router = APIRouter()


@router.get("/db/summary")
def get_summary(
    days: int = Query(default=36500, ge=1),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
) -> dict[str, Any]:
    return fetch_summary(
        days=days,
        account_iban=iban,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/db/account-balances")
def get_account_balances(
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
) -> list[dict[str, Any]]:
    return fetch_account_balances(
        account_iban=iban,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/db/categories/analytics")
def get_category_analytics(
    days: int = Query(default=36500, ge=1),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
) -> list[dict[str, Any]]:
    return fetch_category_analytics(
        days=days,
        account_iban=iban,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/db/partner/analytics")
def get_partner_analytics(
    days: int = Query(default=36500, ge=1),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return fetch_partner_analytics(
        days=days,
        account_iban=iban,
        from_date=from_date,
        to_date=to_date,
    )
