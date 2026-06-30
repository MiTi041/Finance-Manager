from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from finance_server.core.database import get_connection


def fetch_summary(
    days: int | None = None,
    account_iban: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    where_clauses: list[str] = []
    params: list[Any] = []

    if from_date or to_date:
        if from_date:
            where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?")
            params.append(from_date)
        if to_date:
            where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) <= ?")
            params.append(to_date)
    else:
        if days is None:
            days = 36500
        days = max(1, days)
        cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
        where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?")
        params.append(cutoff)

    if account_iban:
        where_clauses.append("account_iban = ?")
        params.append(account_iban)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT
                COALESCE(SUM(amount), 0) AS balance,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS incomes,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses,
                COUNT(*) AS transaction_count
            FROM umsaetze
            WHERE {where_sql}
            """,
            params,
        ).fetchone()

        result = {
            "balance": round(float(row["balance"]), 2),
            "incomes": round(float(row["incomes"]), 2),
            "expenses": round(float(row["expenses"]), 2),
            "transaction_count": row["transaction_count"],
        }

    return result


def fetch_account_balances(
    account_iban: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict[str, Any]]:
    where_clauses: list[str] = []
    params: list[Any] = []

    if from_date or to_date:
        if from_date:
            where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?")
            params.append(from_date)
        if to_date:
            where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) <= ?")
            params.append(to_date)
    else:
        cutoff = (date.today() - timedelta(days=36500)).isoformat()
        where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?")
        params.append(cutoff)

    if account_iban:
        where_clauses.append("account_iban = ?")
        params.append(account_iban)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT account_iban, COALESCE(SUM(amount), 0) AS balance
            FROM umsaetze
            WHERE {where_sql}
            GROUP BY account_iban
            """,
            params,
        ).fetchall()

    return [
        {"account_iban": row["account_iban"], "balance": round(float(row["balance"]), 2)}
        for row in rows
    ]


def fetch_category_analytics(
    days: int | None = None,
    account_iban: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict[str, Any]]:
    where_clauses: list[str] = []
    params: list[Any] = []

    if from_date or to_date:
        if from_date:
            where_clauses.append("COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10)) >= ?")
            params.append(from_date)
        if to_date:
            where_clauses.append("COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10)) <= ?")
            params.append(to_date)
    else:
        if days is None:
            days = 36500
        days = max(1, days)
        cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
        where_clauses.append("COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10)) >= ?")
        params.append(cutoff)

    if account_iban:
        where_clauses.append("u.account_iban = ?")
        params.append(account_iban)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    with get_connection() as conn:
        total_row = conn.execute(
            f"SELECT COALESCE(SUM(ABS(u.amount)), 0) AS total FROM umsaetze u WHERE {where_sql}",
            params,
        ).fetchone()
        total = float(total_row["total"]) if total_row else 1

        rows = conn.execute(
            f"""
            SELECT
                COALESCE(u.kategorie, 0) AS category_id,
                COALESCE(k.name, 'Nicht kategorisiert') AS name,
                COALESCE(k.typ, 'Ausgabe') AS typ,
                k.icon,
                COALESCE(SUM(u.amount), 0) AS total_amount,
                COUNT(*) AS transaction_count
            FROM umsaetze u
            LEFT JOIN kategorien k ON u.kategorie = k.id
            WHERE {where_sql}
            GROUP BY COALESCE(u.kategorie, 0)
            ORDER BY COALESCE(SUM(ABS(u.amount)), 0) DESC
            """,
            params,
        ).fetchall()

    return [
        {
            "category_id": row["category_id"],
            "name": row["name"],
            "typ": row["typ"],
            "icon": row["icon"],
            "total_amount": round(float(row["total_amount"]), 2),
            "transaction_count": row["transaction_count"],
            "percentage": round(float(row["total_amount"]) / total * 100, 1) if total else 0,
        }
        for row in rows
    ]


def fetch_partner_analytics(
    days: int | None = None,
    account_iban: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    where_clauses: list[str] = []
    params: list[Any] = []

    if from_date or to_date:
        if from_date:
            where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?")
            params.append(from_date)
        if to_date:
            where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) <= ?")
            params.append(to_date)
    else:
        if days is None:
            days = 36500
        days = max(1, days)
        cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
        where_clauses.append("COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?")
        params.append(cutoff)

    if account_iban:
        where_clauses.append("account_iban = ?")
        params.append(account_iban)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                COALESCE(NULLIF(recipient_name, ''), NULLIF(applicant_name, ''), 'Unbekannt') AS partner_name,
                COALESCE(NULLIF(applicant_iban, ''), NULLIF(gvc_applicant_iban, ''), '') AS partner_iban,
                SUM(amount) AS total_amount,
                COUNT(*) AS transaction_count
            FROM umsaetze
            WHERE {where_sql}
            GROUP BY partner_name
            ORDER BY SUM(ABS(amount)) DESC
            """,
            params,
        ).fetchall()

    outgoing: list[dict[str, Any]] = []
    incoming: list[dict[str, Any]] = []

    for row in rows:
        total = float(row["total_amount"])
        entry = {
            "name": row["partner_name"],
            "iban": row["partner_iban"],
            "totalAmount": round(abs(total), 2),
            "transactionCount": row["transaction_count"],
            "isCompany": True,
            "logoUrl": None,
            "logoWhiteBackground": False,
            "logoPadding": False,
        }
        if total < 0:
            outgoing.append(entry)
        else:
            incoming.append(entry)

    return {"outgoing": outgoing, "incoming": incoming}
