#!/usr/bin/env python3
"""Import transactions from a CSV file into SQLite without duplicates.

Run from the repository root:
  python server/finance_server/scripts/import_transactions_csv.py
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any


sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from finance_server.db import get_connection
from finance_server.db.utils import (
    build_transaction_hash,
    normalize_local_amount,
    normalize_text,
)


DEFAULT_CSV_PATH = (
    Path(__file__).resolve().parents[3]
    / "server"
    / "finance_server"
    / "db"
    / "state"
    / "transaktionen.csv"
)


def _normalize_row(row: dict[str, str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}

    for key, value in row.items():
        if key in {"amount", "original_amount"}:
            payload[key] = normalize_local_amount(value)
        elif key == "created_at":
            payload[key] = normalize_text(value) or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        else:
            payload[key] = normalize_text(value)

    payload["transaction_hash"] = build_transaction_hash(payload)
    return payload


def import_csv(csv_path: Path) -> dict[str, Any]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        raw_rows = list(reader)

    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        rows.append(_normalize_row(raw))

    if not rows:
        return {"received": 0, "inserted": 0, "ignored": 0, "ignored_rows": []}

    column_names = list(rows[0].keys())
    column_list = ", ".join(column_names)
    placeholder_list = ", ".join(f":{column}" for column in column_names)

    with get_connection() as connection:
        # Find which transaction_hash values already exist to show ignored rows
        hashes = [r["transaction_hash"] for r in rows]
        existing_hashes: set[str] = set()
        # SQLite has a param limit; chunk the IN queries
        def chunked(iterable, size):
            for i in range(0, len(iterable), size):
                yield iterable[i : i + size]

        for chunk in chunked(hashes, 500):
            placeholder = ",".join("?" for _ in chunk)
            q = f"SELECT transaction_hash FROM umsaetze WHERE transaction_hash IN ({placeholder})"
            for row in connection.execute(q, chunk).fetchall():
                existing_hashes.add(row[0])

        ignored_rows = [r for r in rows if r["transaction_hash"] in existing_hashes]
        to_insert = [r for r in rows if r["transaction_hash"] not in existing_hashes]

        before = connection.total_changes
        if to_insert:
            connection.executemany(
                f"""
                INSERT OR IGNORE INTO umsaetze ({column_list})
                VALUES ({placeholder_list})
                """,
                to_insert,
            )
        inserted = connection.total_changes - before

    received = len(rows)
    ignored = [
        {"transaction_hash": r["transaction_hash"], "date": r.get("date"), "amount": r.get("amount"), "posting_text": r.get("posting_text")} for r in ignored_rows
    ]

    return {
        "received": received,
        "inserted": inserted,
        "ignored": len(ignored_rows),
        "ignored_rows": ignored,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import transactions CSV into SQLite without duplicates")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH, help="Path to the CSV file")
    args = parser.parse_args()

    stats = import_csv(args.csv)
    print(
        "Imported CSV rows: "
        f"received={stats['received']}, inserted={stats['inserted']}, ignored={stats['ignored']}"
    )
    if stats.get("ignored_rows"):
        print("Ignored rows (already existing transaction_hash):")
        for r in stats["ignored_rows"]:
            print(f"- {r['transaction_hash']} | date={r.get('date')} | amount={r.get('amount')} | {r.get('posting_text')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())