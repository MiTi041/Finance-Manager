#!/usr/bin/env python3
"""Migrate existing Adyen transactions to use pseud-IBANs.

Der echte Händler steckt bei Adyen in ``deviate_applicant`` ("Händler/Straße/Ort/DE").
Das Skript setzt applicant_name/applicant_iban um und legt für jeden Händler ein
``ADYEN:<HÄNDLER>``-Mapping auf einen Zahlungspartner an.

Run from repository root:
  python backend/finance_server/scripts/migrate_adyen_transactions.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from finance_server.db import get_connection
from finance_server.db.utils import build_transaction_hash
from finance_server.services.payroll_parsing import enrich_adyen_merchant

# Händler ohne bestehenden Zahlungspartner, die automatisch angelegt werden.
# Händlername (normalisiert) -> (Anzeigename, Website)
NEW_MERCHANTS: dict[str, tuple[str, str]] = {
    "DECATHLON BIELEFELD": ("Decathlon", "https://www.decathlon.de/"),
    "AUTOGRILL DEUTSCHLAND": ("Autogrill", "https://www.autogrill.de/"),
}


def _normalize(value: str) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def _find_partner(connection, merchant: str) -> int | None:
    target = _normalize(merchant)
    best_id = None
    best_len = 0
    for row in connection.execute("SELECT id, name FROM zahlungspartner"):
        name = _normalize(row["name"])
        if len(name) >= 4 and name in target and len(name) > best_len:
            best_id = row["id"]
            best_len = len(name)
    return best_id


def _create_partner(connection, name: str, website: str) -> int:
    domain = website.split("//", 1)[-1].strip("/").removeprefix("www.")
    cursor = connection.execute(
        "INSERT INTO zahlungspartner (name, website, logo_url) VALUES (?, ?, ?)",
        (name, website, f"https://logos.hunter.io/{domain}"),
    )
    return int(cursor.lastrowid)


def _map_merchant(connection, merchant: str, pseudo_iban: str) -> str:
    partner_id = _find_partner(connection, merchant)
    created = False
    if partner_id is None:
        entry = NEW_MERCHANTS.get(merchant.upper())
        if entry is None:
            return "unmapped"
        partner_id = _create_partner(connection, *entry)
        created = True

    connection.execute(
        """
        INSERT INTO ibans (iban, f_zahlungspartner_id)
        VALUES (?, ?)
        ON CONFLICT(iban) DO UPDATE SET f_zahlungspartner_id = excluded.f_zahlungspartner_id
        """,
        (pseudo_iban, partner_id),
    )
    return "created" if created else "mapped"


def migrate_adyen_transactions() -> dict[str, int]:
    stats = {
        "checked": 0, "migrated": 0, "no_merchant": 0, "already_done": 0,
        "mapped": 0, "unmapped": 0, "partners_created": 0,
    }

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM umsaetze WHERE applicant_name LIKE '%Adyen%'"
        ).fetchall()

        for row in rows:
            tx = dict(row)
            stats["checked"] += 1

            if not tx["applicant_iban"].startswith("ADYEN:"):
                enrich_adyen_merchant(tx)
                if not tx["applicant_iban"].startswith("ADYEN:"):
                    stats["no_merchant"] += 1
                    continue

                conn.execute(
                    """
                    UPDATE umsaetze SET
                        applicant_iban = ?,
                        applicant_bic = ?,
                        applicant_name = ?,
                        gvc_applicant_iban = ?,
                        gvc_applicant_bic = ?,
                        transaction_hash = ?
                    WHERE id = ?
                    """,
                    (
                        tx["applicant_iban"],
                        tx["applicant_bic"],
                        tx["applicant_name"],
                        tx["gvc_applicant_iban"],
                        tx["gvc_applicant_bic"],
                        build_transaction_hash(tx),
                        tx["id"],
                    ),
                )
                stats["migrated"] += 1
            else:
                stats["already_done"] += 1

            merchant = tx["applicant_name"].removeprefix("ADYEN ").strip()
            result = _map_merchant(conn, merchant, tx["applicant_iban"])
            if result == "unmapped":
                stats["unmapped"] += 1
            else:
                stats["mapped"] += 1
                if result == "created":
                    stats["partners_created"] += 1

    return stats


def main() -> int:
    stats = migrate_adyen_transactions()
    print(
        f"Adyen-Migration: {stats['checked']} geprüft, "
        f"{stats['migrated']} migriert, "
        f"{stats['no_merchant']} ohne Händler (übersprungen), "
        f"{stats['already_done']} bereits erledigt, "
        f"{stats['mapped']} gemappt "
        f"({stats['partners_created']} Zahlungspartner angelegt), "
        f"{stats['unmapped']} ohne Zahlungspartner"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
