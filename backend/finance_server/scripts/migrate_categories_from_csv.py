#!/usr/bin/env python3
"""Migrate old category assignments from CSV backup into current DB.

Run from repository root:
  python backend/finance_server/scripts/migrate_categories_from_csv.py
"""
from __future__ import annotations

import csv
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from finance_server.db import get_connection

BASE_DIR = Path(__file__).resolve().parents[3]
OLD_DATA_CSV = BASE_DIR / "backend" / "finance_server" / "db" / "olddata.csv"
OLD_CATEGORIES_CSV = BASE_DIR / "backend" / "finance_server" / "db" / "oldcategories.csv"


def parse_date(ddmmyyyy: str) -> str:
    try:
        return datetime.strptime(ddmmyyyy.strip().strip('"'), "%d.%m.%Y").date().isoformat()
    except (ValueError, AttributeError):
        return ddmmyyyy.strip().strip('"')


def import_old_categories() -> int:
    with open(OLD_CATEGORIES_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    with get_connection() as conn:
        conn.execute("PRAGMA foreign_keys = OFF")

        inserted = 0
        for row in rows:
            cid = int(row["id"])
            name = row["name"].strip()
            typ = row["typ"].strip()
            parent_raw = row.get("parent_id", "").strip()
            parent_id = int(parent_raw) if parent_raw else None

            exists = conn.execute("SELECT 1 FROM kategorien WHERE id = ?", (cid,)).fetchone()
            if exists:
                continue

            conn.execute(
                "INSERT INTO kategorien (id, name, typ, parent_id) VALUES (?, ?, ?, ?)",
                (cid, name, typ, parent_id),
            )
            inserted += 1

        conn.execute("PRAGMA foreign_keys = ON")

    return inserted


def find_exact_match(conn, betrag: float, iso_date: str, csv_iban: str) -> int | None:
    row = conn.execute(
        """
        SELECT id FROM umsaetze
        WHERE ROUND(ABS(amount - ?), 2) = 0
          AND entry_date = ?
          AND (applicant_iban = ? OR gvc_applicant_iban = ?)
        LIMIT 1
        """,
        (betrag, iso_date, csv_iban, csv_iban),
    ).fetchone()
    return row["id"] if row else None


def find_fuzzy_match(conn, betrag: float, iso_date: str, csv_iban: str, csv_purpose: str) -> int | None:
    dt = datetime.strptime(iso_date, "%Y-%m-%d")
    candidates = []
    for offset in range(-5, 6):
        check_date = (dt + timedelta(days=offset)).date().isoformat()
        for row in conn.execute(
            """
            SELECT id, purpose FROM umsaetze
            WHERE ROUND(ABS(amount - ?), 2) = 0
              AND entry_date = ?
              AND (applicant_iban = ? OR gvc_applicant_iban = ?)
            """,
            (betrag, check_date, csv_iban, csv_iban),
        ).fetchall():
            candidates.append((abs(offset), row["id"], row["purpose"]))

    if not candidates:
        return None

    candidates.sort(key=lambda c: c[0])
    best_diff = candidates[0][0]
    tied = [c for c in candidates if c[0] == best_diff]

    if len(tied) == 1:
        return tied[0][1]

    purpose_match = [c for c in tied if c[2] == csv_purpose]
    if len(purpose_match) == 1:
        return purpose_match[0][1]

    return tied[0][1]


def match_and_update() -> tuple[int, int, int]:
    with open(OLD_DATA_CSV, newline="", encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))

    matched = 0
    not_matched = 0
    total = len(csv_rows)

    with get_connection() as conn:
        for row in csv_rows:
            try:
                betrag = float(row["betrag"])
            except (ValueError, TypeError):
                not_matched += 1
                continue

            iso_date = parse_date(row.get("buchungstag", ""))
            csv_iban = row.get("iban", "").strip().strip('"')
            csv_purpose = row.get("verwendungszweck", "").strip().strip('"')
            old_cat_id = row.get("kategorie", "").strip().strip('"')

            if not old_cat_id:
                not_matched += 1
                continue
            old_cat_id = int(old_cat_id)

            found_id = find_exact_match(conn, betrag, iso_date, csv_iban)
            if found_id is None and csv_purpose:
                found_id = find_fuzzy_match(conn, betrag, iso_date, csv_iban, csv_purpose)

            if found_id:
                conn.execute(
                    "UPDATE umsaetze SET kategorie = ? WHERE id = ?",
                    (old_cat_id, found_id),
                )
                matched += 1
            else:
                not_matched += 1

    return matched, not_matched, total


def clear_other_categories() -> int:
    with get_connection() as conn:
        result = conn.execute("UPDATE umsaetze SET kategorie = NULL WHERE kategorie >= 100")
        return result.rowcount


def main() -> int:
    print("Importiere alte Kategorien...")
    cats = import_old_categories()
    print(f"  {cats} neue Kategorien angelegt")

    print("\nMatche CSV-Transaktionen gegen DB...")
    matched, missed, total = match_and_update()
    print(f"  {matched} von {total} gematcht und aktualisiert")
    print(f"  {missed} ohne Match (ignoriert)")

    print("\nEntferne nicht-gematchte Kategorisierungen...")
    cleared = clear_other_categories()
    print(f"  {cleared} Transaktionen auf NULL gesetzt")

    print("\nFertig.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
