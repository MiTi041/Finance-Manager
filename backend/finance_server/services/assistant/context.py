from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from finance_server.db.analytics import (
    fetch_account_balances,
    fetch_category_analytics,
    fetch_summary,
)
from finance_server.db.budgets import list_budgets
from finance_server.db.transactions import fetch_transactions

MAX_CONTEXT_TRANSACTIONS = 200


def resolve_date_range(from_date: str | None, to_date: str | None) -> tuple[str, str]:
    today = date.today()
    end = to_date or today.isoformat()
    start = from_date or (today - timedelta(days=365)).isoformat()
    return start, end


def _compact_transaction(
    transaction: dict[str, Any], category_names: dict[int, str]
) -> dict[str, Any]:
    category_id = transaction.get("kategorie")
    return {
        "date": (
            transaction.get("entry_date")
            or transaction.get("date")
            or str(transaction.get("created_at", ""))[:10]
        ),
        "amount": transaction.get("amount"),
        "recipient": transaction.get("recipient_name")
        or transaction.get("applicant_name")
        or "",
        "purpose": transaction.get("purpose") or transaction.get("purpose_edit") or "",
        "category": category_names.get(category_id, ""),
    }


def build_context(from_date: str | None, to_date: str | None) -> dict[str, Any]:
    start, end = resolve_date_range(from_date, to_date)
    budgets_month = datetime.now().strftime("%Y-%m")
    # fetch_summary filtert auf bekannte Bankkonten ("AND ba.iban IS NOT NULL"),
    # fetch_transactions nicht. Ohne diesen Abgleich widersprächen sich Saldo und
    # Transaktionsliste, und transaction_count samt Trunkierungs-Hinweis nicht.
    transactions = [
        transaction
        for transaction in fetch_transactions(None, from_date=start, to_date=end)
        if not transaction.get("bank_deleted")
    ]
    categories = fetch_category_analytics(from_date=start, to_date=end)
    # umsaetze.kategorie ist eine INTEGER-ID; die Analytics-Zeilen bringen den
    # Namen für genau dasselbe Zeitfenster ohne Kontofilter bereits mit.
    # list_categories() würde dafür je Kategorie einmal die ganze umsaetze-Tabelle
    # zählen (kein Index auf kategorie) — der Count wird hier ohnehin verworfen.
    category_names = {
        category["category_id"]: category["name"]
        for category in categories
        if category.get("name")
    }
    compact = [
        _compact_transaction(transaction, category_names)
        for transaction in transactions[:MAX_CONTEXT_TRANSACTIONS]
    ]
    return {
        "date_from": start,
        "date_to": end,
        "summary": fetch_summary(from_date=start, to_date=end),
        "categories": categories,
        "balances": fetch_account_balances(),
        "budgets": list_budgets(budgets_month),
        "budgets_month": budgets_month,
        "transactions": compact,
        "transaction_count": len(transactions),
        "transactions_truncated": len(transactions) > MAX_CONTEXT_TRANSACTIONS,
    }


def build_system_prompt(context: dict[str, Any]) -> str:
    lines = [
        "Du bist ein Assistent für persönliche Finanzen in einer lokalen App.",
        "Antworte auf Deutsch, kurz und präzise.",
        "Nutze ausschließlich die unten gelieferten Daten. Erfinde keine Zahlen.",
        f"Zeitraum: {context['date_from']} bis {context['date_to']}.",
        "",
        "Zusammenfassung (EUR):",
        f"- Einnahmen: {context['summary'].get('incomes', 0):.2f}",
        f"- Ausgaben: {context['summary'].get('expenses', 0):.2f}",
        f"- Saldo: {context['summary'].get('balance', 0):.2f}",
    ]

    if context["categories"]:
        lines += ["", "Ausgaben je Kategorie (EUR):"]
        for category in context["categories"]:
            lines.append(
                f"- {category.get('name', '?')}: {category.get('total_amount', 0):.2f}"
            )

    if context["balances"]:
        lines += ["", "Kontostände (EUR, aktueller Stand, nicht auf den Zeitraum bezogen):"]
        for balance in context["balances"]:
            lines.append(
                f"- {balance.get('account_iban', '?')}: {balance.get('balance', 0):.2f}"
            )

    if context["budgets"]:
        lines += ["", f"Budgets (EUR, Monat {context['budgets_month']}):"]
        for budget in context["budgets"]:
            lines.append(
                f"- {budget.get('name', '?')}: {budget.get('spent', 0):.2f} "
                f"von {budget.get('amount', 0):.2f}"
            )

    lines += ["", f"Transaktionen ({len(context['transactions'])}):"]
    for transaction in context["transactions"]:
        lines.append(
            f"- {transaction['date']} | {transaction['amount']:.2f} EUR | "
            f"{transaction['recipient']} | {transaction['purpose']} | "
            f"{transaction['category']}"
        )

    if context["transactions_truncated"]:
        lines.append(
            f"(Hinweis: nur die ersten {MAX_CONTEXT_TRANSACTIONS} von "
            f"{context['transaction_count']} Transaktionen enthalten.)"
        )

    return "\n".join(lines)
