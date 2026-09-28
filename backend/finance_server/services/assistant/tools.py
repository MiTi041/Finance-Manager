from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Callable

from finance_server.core.database import get_connection
from finance_server.db.analytics import (
    fetch_account_balances,
    fetch_category_analytics,
    fetch_partner_analytics,
    fetch_summary,
)
from finance_server.db.budgets import list_budgets
from finance_server.db.categories import list_categories
from finance_server.db.references import list_zahlungspartner_iban_mappings
from finance_server.db.transactions import fetch_transactions
from finance_server.fints.banks import get_bank_definition

# ponytail: feste Obergrenze statt Pagination — das Modell grenzt ueber
# Zeitraum/Kategorie/Suche ein. Erhoehen, falls Antworten zu oft abgeschnitten sind.
DEFAULT_TRANSACTION_LIMIT = 200
MAX_TRANSACTION_LIMIT = 500


def _date_props() -> dict[str, Any]:
    return {
        "from_date": {
            "type": "string",
            "description": "Startdatum YYYY-MM-DD. Weglassen = alle Daten ab Anfang.",
        },
        "to_date": {
            "type": "string",
            "description": "Enddatum YYYY-MM-DD. Weglassen = bis heute.",
        },
    }


def _account_prop() -> dict[str, Any]:
    return {
        "account_iban": {
            "type": "string",
            "description": (
                "Optional: IBAN genau eines Kontos, aus list_accounts. Weglassen = alle "
                "Konten. Kein Kontoname und kein Platzhalter."
            ),
        }
    }


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": []}


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_summary",
            "description": (
                "Einnahmen, Ausgaben, Saldo und Anzahl der Transaktionen fuer einen "
                "Zeitraum. Ohne Datumsangabe ueber alle Daten."
            ),
            "parameters": _object({**_date_props(), **_account_prop()}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_analytics",
            "description": (
                "Summe, Anzahl und prozentualer Anteil je Kategorie fuer einen Zeitraum. "
                "Der Standardweg fuer Fragen wie 'wofuer habe ich am meisten ausgegeben'."
            ),
            "parameters": _object({**_date_props(), **_account_prop()}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_account_balances",
            "description": "Kontostaende je Konto (aktueller Stand, inkl. vorgemerkter Betraege).",
            "parameters": _object({**_date_props(), **_account_prop()}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_budgets",
            "description": "Alle Budgets mit ausgegebenem Betrag und Restbetrag (laufender Monat).",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_transactions",
            "description": (
                "Einzelne Transaktionen suchen und auflisten. Immer einschraenken (Zeitraum, "
                "Kategorie oder Suchbegriff), sonst kommen nur die neuesten zurueck."
            ),
            "parameters": _object(
                {
                    **_date_props(),
                    **_account_prop(),
                    "category_id": {
                        "type": "integer",
                        "description": "Optional: Kategorie-ID aus list_categories.",
                    },
                    "search": {
                        "type": "string",
                        "description": (
                            "Optional: Text in Empfaenger, Antragsteller, Zweck oder Name "
                            "des Zahlungspartners."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            f"Maximale Anzahl, Standard {DEFAULT_TRANSACTION_LIMIT}, "
                            f"Obergrenze {MAX_TRANSACTION_LIMIT}."
                        ),
                    },
                }
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_partner_analytics",
            "description": "Summen je Zahlungspartner (Empfaenger/Antragsteller), getrennt nach Ein- und Ausgang.",
            "parameters": _object({**_date_props(), **_account_prop()}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_accounts",
            "description": (
                "Alle Bankkonten mit IBAN, Kontoname, Bank und Inhaber. Vor einer Frage zu "
                "einem bestimmten Konto aufrufen und die passende IBAN als account_iban an "
                "die anderen Werkzeuge uebergeben."
            ),
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": "Alle Kategorien mit ID, Name, Typ und uebergeordneter Kategorie.",
            "parameters": _object({}),
        },
    },
]


_IBAN_LIKE_NAME = re.compile(r"^[A-Z]{2}\d")


def _normalize_iban(value: Any) -> str:
    return "".join(str(value or "").split()).upper()


def _iban_partner_names() -> dict[str, str]:
    """IBAN -> Zahlungspartner-Name, damit das Modell dieselben aufgeloesten
    Namen sieht wie die Oberflaeche statt roher Bankfelder."""
    return {
        _normalize_iban(row["iban"]): row["zahlungspartner_name"]
        for row in list_zahlungspartner_iban_mappings()
    }


def _partner_name(transaction: dict[str, Any], partner_names: dict[str, str]) -> str:
    iban = _normalize_iban(
        transaction.get("applicant_iban") or transaction.get("gvc_applicant_iban")
    )
    resolved = partner_names.get(iban) if iban else None
    if resolved:
        return resolved

    # Gleiche Heuristik wie die Oberflaeche: ein IBAN-artiger Auftraggeber
    # (z. B. "DE89...") ist kein Name, dann greift der Empfaenger.
    applicant = (transaction.get("applicant_name") or "").strip()
    if applicant and not _IBAN_LIKE_NAME.match(applicant):
        return applicant
    return (transaction.get("recipient_name") or "").strip()


def _compact_transaction(
    transaction: dict[str, Any],
    category_names: dict[int, str],
    partner_names: dict[str, str],
) -> dict[str, Any]:
    return {
        "date": (
            transaction.get("entry_date")
            or transaction.get("date")
            or str(transaction.get("created_at", ""))[:10]
        ),
        "amount": transaction.get("amount"),
        "partner": _partner_name(transaction, partner_names),
        "purpose": transaction.get("purpose") or transaction.get("purpose_edit") or "",
        "category": category_names.get(transaction.get("kategorie"), ""),
        "account_iban": transaction.get("account_iban"),
    }


def _get_transactions(arguments: dict[str, Any]) -> dict[str, Any]:
    limit = arguments.get("limit")
    try:
        limit = int(limit) if limit is not None else DEFAULT_TRANSACTION_LIMIT
    except (TypeError, ValueError):
        limit = DEFAULT_TRANSACTION_LIMIT
    limit = min(max(1, limit), MAX_TRANSACTION_LIMIT)

    category_id = arguments.get("category_id")
    try:
        category_id = int(category_id) if category_id is not None else None
    except (TypeError, ValueError):
        category_id = None

    rows = fetch_transactions(
        None,
        account_iban=_known_account_iban(arguments.get("account_iban")),
        from_date=arguments.get("from_date"),
        to_date=arguments.get("to_date"),
        category_id=category_id,
        search=arguments.get("search"),
        limit=limit,
    )
    category_names = {
        category["id"]: category["name"] for category in list_categories()
    }
    partner_names = _iban_partner_names()
    return {
        "transactions": [
            _compact_transaction(row, category_names, partner_names) for row in rows
        ],
        "returned": len(rows),
        "limit": limit,
    }


def _account_rows() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT iban, account_name, holder_name, bank_key, archived
            FROM bank_accounts
            ORDER BY archived, is_primary DESC, account_name, iban
            """
        ).fetchall()

    accounts: list[dict[str, Any]] = []
    for row in rows:
        bank_key = row["bank_key"] or ""
        # get_bank_definition("") wuerde per Teilstring-Treffer die erste Bank
        # zurueckgeben — leere Schluessel deshalb gar nicht erst aufloesen.
        if not bank_key:
            bank_name = ""
        else:
            try:
                bank_name = get_bank_definition(bank_key).name
            except KeyError:
                bank_name = bank_key
        accounts.append(
            {
                "iban": row["iban"],
                "name": row["account_name"],
                "bank": bank_name,
                "bank_key": bank_key,
                "holder": row["holder_name"],
                "archived": bool(row["archived"]),
            }
        )
    return accounts


def _account_label(account: dict[str, Any]) -> str:
    label = " ".join(
        part for part in (account.get("bank"), account.get("name")) if part
    ).strip()
    return label or str(account.get("iban"))


def _known_account_iban(value: Any) -> str | None:
    """Nur die IBAN durchreichen, keine Namenssuche.

    Das Modell loest den Kontonamen ueber list_accounts selbst auf. Ein
    erfundener oder als Platzhalter verwendeter Wert darf aber nicht still zu
    einem leeren Ergebnis fuehren — das Modell wuerde sonst 'keine Ausgaben'
    behaupten. Unbekannt heisst deshalb Fehler mit der Kontenliste.
    """
    normalized = "".join(str(value or "").split()).upper()
    if not normalized:
        return None

    accounts = _account_rows()
    for account in accounts:
        if "".join(str(account["iban"]).split()).upper() == normalized:
            return account["iban"]

    labels = "; ".join(_account_label(account) for account in accounts) or "keine"
    raise ValueError(
        f"Unbekannte IBAN '{value}'. Nutze list_accounts und uebernimm eine der dortigen "
        f"IBANs. Verfuegbare Konten: {labels}."
    )


def _list_accounts(_arguments: dict[str, Any]) -> list[dict[str, Any]]:
    return _account_rows()


_HANDLERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "get_summary": lambda a: fetch_summary(
        from_date=a.get("from_date"),
        to_date=a.get("to_date"),
        account_iban=_known_account_iban(a.get("account_iban")),
    ),
    "get_category_analytics": lambda a: fetch_category_analytics(
        from_date=a.get("from_date"),
        to_date=a.get("to_date"),
        account_iban=_known_account_iban(a.get("account_iban")),
    ),
    "get_account_balances": lambda a: fetch_account_balances(
        from_date=a.get("from_date"),
        to_date=a.get("to_date"),
        account_iban=_known_account_iban(a.get("account_iban")),
    ),
    "get_budgets": lambda a: list_budgets(datetime.now().strftime("%Y-%m")),
    "get_transactions": _get_transactions,
    "get_partner_analytics": lambda a: fetch_partner_analytics(
        from_date=a.get("from_date"),
        to_date=a.get("to_date"),
        account_iban=_known_account_iban(a.get("account_iban")),
    ),
    "list_accounts": _list_accounts,
    "list_categories": lambda a: list_categories(),
}


def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """Tool ausfuehren und das Ergebnis als JSON-String zurueckgeben.

    Fehler landen als ``{"error": ...}`` im Ergebnis statt als Exception: das
    Modell kann so auf einen falschen Tool-/Argumentnamen reagieren, ohne dass
    der ganze Stream abbricht.
    """
    handler = _HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"Unbekanntes Tool: {name}"}, ensure_ascii=False)
    try:
        result = handler(arguments)
    except Exception as err:  # noqa: BLE001 — dem Modell die Meldung zeigen
        return json.dumps({"error": str(err) or type(err).__name__}, ensure_ascii=False)
    return json.dumps(result, ensure_ascii=False, default=str)
