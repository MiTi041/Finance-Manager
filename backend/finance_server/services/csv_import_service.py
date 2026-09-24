from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import datetime
from typing import Any

from finance_server.db import (
    existing_transaction_hashes,
    insert_transactions,
    list_categories,
    load_bank_credentials_by_iban,
    to_row_payload,
)
from finance_server.db.utils import normalize_text

SCHEMAS: dict[str, dict[str, Any]] = {
    "c24": {
        "label": "C24",
        "delimiter": ",",
        "encodings": ["utf-8-sig", "cp1252"],
        "date_formats": ["%d.%m.%Y", "%Y-%m-%d"],
        "columns": {
            "date": ["Buchungsdatum"],
            "amount": ["Betrag"],
            "recipient_name": ["Zahlungsempfänger"],
            "recipient_iban": ["IBAN"],
            "purpose": ["Verwendungszweck"],
            "category": ["Kategorie", "Unterkategorie"],
            "note": ["Beschreibung"],
        },
    },
    "generic": {
        "label": "Generisch",
        "delimiter": ",",
        "encodings": ["utf-8-sig", "cp1252"],
        "date_formats": ["%Y-%m-%d", "%d.%m.%Y"],
        "columns": {
            "date": ["date", "datum", "buchungsdatum"],
            "amount": ["amount", "betrag"],
            "recipient_name": ["recipient_name", "empfänger", "zahlungsempfänger"],
            "recipient_iban": ["recipient_iban", "iban"],
            "purpose": ["purpose", "verwendungszweck"],
            "category": ["category", "kategorie"],
            "note": ["note", "notiz", "beschreibung"],
        },
    },
}

_AMOUNT_CLEAN = re.compile(r"[^\d,.\-]")
_AMOUNT_BODY = r"-?\d{1,3}(?:[.\u00a0 ]\d{3})*,\d{2}(?:\s*€)?"
# ponytail: feldverankert, damit nur ganze ungequotete Betragsfelder gequotet
# werden. `€` optional, Tausender `.`/Leerzeichen/NBSP. Deckt deutsche Beträge
# auch ohne Währung und im generischen Schema ab.
_GERMAN_AMOUNT = re.compile(rf"(^|,)({_AMOUNT_BODY})(?=,|\r?$)", re.MULTILINE)


def _normalize_amount_fields(text: str) -> str:
    """Quote unquoted German amounts like `0,01 €` or `-0,01` so the decimal
    comma does not split the CSV field. Already-quoted amounts are left untouched."""
    return _GERMAN_AMOUNT.sub(
        lambda match: f'{match.group(1)}"{match.group(2)}"',
        text,
    )


def list_schemas() -> list[dict[str, Any]]:
    return [
        {"key": key, "label": schema["label"], "columns": sorted(schema["columns"])}
        for key, schema in SCHEMAS.items()
    ]


def _normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def _decode(content: bytes, schema: dict[str, Any]) -> str:
    for encoding in schema["encodings"]:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _detect_delimiter(text: str, schema: dict[str, Any]) -> str:
    sample = text[:2048]
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
    except csv.Error:
        return schema["delimiter"]


def _map_headers(fieldnames: list[str], schema: dict[str, Any]) -> dict[str, list[str]]:
    lookup = {_normalize_header(name): name for name in fieldnames or []}
    mapping: dict[str, list[str]] = {}
    for field, candidates in schema["columns"].items():
        headers = [lookup[_normalize_header(c)] for c in candidates if _normalize_header(c) in lookup]
        if headers:
            mapping[field] = headers
    return mapping


def parse_amount(raw: Any) -> float | None:
    if raw is None:
        return None
    text = _AMOUNT_CLEAN.sub("", str(raw)).strip()
    if not text or text in {"-", ".", ","}:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def parse_date(raw: Any, formats: list[str]) -> str | None:
    text = str(raw or "").strip()
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _category_index() -> dict[str, int]:
    index: dict[str, int] = {}
    for category in list_categories():
        name = normalize_text(category.get("name"))
        if name:
            index.setdefault(name.lower(), int(category["id"]))
    return index


def _match_category(text: str, index: dict[str, int]) -> int | None:
    if not text:
        return None
    candidates = [text, *[part.strip() for part in re.split(r"[/>]", text)]]
    for candidate in candidates:
        if candidate and candidate.lower() in index:
            return index[candidate.lower()]
    return None


def _make_transaction_id(
    account_iban: str | None,
    date_value: str | None,
    amount: float | None,
    recipient_name: str | None,
    purpose: str | None,
) -> str:
    raw = "|".join(
        [
            str(account_iban or ""),
            str(date_value or ""),
            f"{amount:.4f}" if isinstance(amount, (int, float)) else "",
            str(recipient_name or ""),
            str(purpose or ""),
        ]
    )
    return "manual-csv-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _build_row(account_iban: str, row: dict[str, Any]) -> dict[str, Any]:
    return {
        "account": {"iban": account_iban},
        "data": {
            "id": row.get("transaction_id"),
            "date": row.get("date"),
            "entry_date": row.get("date"),
            "amount": row.get("amount"),
            "recipient_name": row.get("recipient_name"),
            "applicant_iban": row.get("recipient_iban"),
            "purpose": row.get("purpose"),
            "kategorie": row.get("category"),
            "note": row.get("note"),
            "dummy_entry": True,
        },
    }


def _parse_row(
    raw: dict[str, str],
    header_map: dict[str, list[str]],
    schema: dict[str, Any],
    categories: dict[str, int],
    account_iban: str,
) -> dict[str, Any]:
    def get(field: str) -> Any:
        headers = header_map.get(field)
        return raw.get(headers[0]) if headers else None

    def get_multi(field: str) -> str:
        headers = header_map.get(field, [])
        return "/".join(value for value in (raw.get(header) for header in headers) if value)

    date_value = parse_date(get("date"), schema["date_formats"])
    amount_value = parse_amount(get("amount"))
    category_text = normalize_text(get_multi("category"))
    row: dict[str, Any] = {
        "date": date_value,
        "amount": amount_value,
        "recipient_name": normalize_text(get("recipient_name")),
        "recipient_iban": normalize_text(get("recipient_iban")),
        "purpose": normalize_text(get("purpose")),
        "category": _match_category(category_text, categories),
        "category_text": category_text,
        "note": normalize_text(get("note")),
        "status": "ok",
        "error": None,
        "transaction_hash": None,
    }
    if not date_value:
        row["status"], row["error"] = "invalid", "Ungültiges oder fehlendes Datum"
    elif amount_value is None or abs(amount_value) <= 0.0001:
        row["status"], row["error"] = "invalid", "Ungültiger oder fehlender Betrag"

    row["transaction_id"] = _make_transaction_id(
        account_iban, date_value, amount_value, row["recipient_name"], row["purpose"]
    )
    if row["status"] == "ok":
        row["transaction_hash"] = to_row_payload(_build_row(account_iban, row))[
            "transaction_hash"
        ]
    return row


def parse_csv(content: bytes, schema_key: str, account_iban: str) -> list[dict[str, Any]]:
    schema = SCHEMAS.get(schema_key)
    if schema is None:
        raise ValueError("UNKNOWN_CSV_SCHEMA")
    text = _decode(content, schema)
    delimiter = _detect_delimiter(text, schema)
    text = _normalize_amount_fields(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    header_map = _map_headers(reader.fieldnames or [], schema)
    categories = _category_index()
    rows = []
    for raw in reader:
        if _row_is_empty(raw):
            continue
        rows.append(_parse_row(raw, header_map, schema, categories, account_iban))
    return rows


def _row_is_empty(raw: dict[str, Any]) -> bool:
    for value in raw.values():
        values = value if isinstance(value, list) else [value]
        if any((item or "").strip() for item in values):
            return False
    return True


def preview_csv(content: bytes, schema_key: str, account_iban: str) -> dict[str, Any]:
    rows = parse_csv(content, schema_key, account_iban)
    hashes = [row["transaction_hash"] for row in rows if row.get("transaction_hash")]
    existing = existing_transaction_hashes(hashes)
    for row in rows:
        if row["status"] == "ok" and row["transaction_hash"] in existing:
            row["status"] = "duplicate"
    counts = {
        "total": len(rows),
        "ok": sum(1 for row in rows if row["status"] == "ok"),
        "duplicate": sum(1 for row in rows if row["status"] == "duplicate"),
        "invalid": sum(1 for row in rows if row["status"] == "invalid"),
    }
    return {"rows": rows, "counts": counts}


def import_csv(account_iban: str, rows: list[dict[str, Any]]) -> dict[str, int]:
    credentials = load_bank_credentials_by_iban(account_iban)
    if not credentials or normalize_text(credentials.get("bank_key")).lower() != "manual":
        raise ValueError("MANUAL_ACCOUNT_REQUIRED")

    insert_rows = [
        _build_row(account_iban, row)
        for row in rows
        if row.get("status") != "invalid"
        and row.get("date")
        and row.get("amount") is not None
    ]
    if not insert_rows:
        return {"received": 0, "inserted": 0, "ignored": 0}
    return insert_transactions(insert_rows)
