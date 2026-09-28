#!/usr/bin/env python3
"""Migrate existing debit card transactions to use pseud-IBANs.

Bei Kartenzahlungen belastet Norisbank das Konto der Karte ("NORISBANK
DEBITKARTE" / "ABRECHNUNG KARTE"), der echte Händler steckt als erstes Segment
im ``purpose`` ("Händler/Ort/LAND TT-MM-JJJJTHH:MM:SS Kartennr. ...").
Das Skript setzt applicant_name/applicant_iban um und legt für jeden Händler ein
``KARTE:<HÄNDLER>``-Mapping auf einen Zahlungspartner an.

Buchungen ohne Händler ("Lastschrift aus Kartenzahlung") bleiben unangetastet.

Run from repository root:
  python backend/finance_server/scripts/migrate_card_transactions.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from finance_server.db import get_connection
from finance_server.db.utils import build_transaction_hash
from finance_server.scripts.migrate_adyen_transactions import (
    _create_partner,
    _find_partner,
)
from finance_server.services.payroll_parsing import enrich_card_merchant

# Händler ohne bestehenden Zahlungspartner, die automatisch angelegt werden.
# Leer: der Fuzzy-Match in _find_partner trifft bei Kartenzahlungen (REWE, Subway,
# Apple, ...) bereits auf vorhandene Partner. Bei neuen Händlern hier eintragen.
NEW_MERCHANTS: dict[str, tuple[str, str]] = {}


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


def migrate_card_transactions() -> dict[str, int]:
    stats = {
        "checked": 0, "migrated": 0, "no_merchant": 0, "already_done": 0,
        "mapped": 0, "unmapped": 0, "partners_created": 0,
    }

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM umsaetze WHERE applicant_name LIKE '%KARTE%'"
        ).fetchall()

        for row in rows:
            tx = dict(row)
            stats["checked"] += 1

            if not (tx["applicant_iban"] or "").startswith("KARTE:"):
                enrich_card_merchant(tx)
                if not (tx["applicant_iban"] or "").startswith("KARTE:"):
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

            merchant = tx["applicant_name"].removeprefix("KARTE ").strip()
            result = _map_merchant(conn, merchant, tx["applicant_iban"])
            if result == "unmapped":
                stats["unmapped"] += 1
            else:
                stats["mapped"] += 1
                if result == "created":
                    stats["partners_created"] += 1

    return stats


def main() -> int:
    stats = migrate_card_transactions()
    print(
        f"Karten-Migration: {stats['checked']} geprüft, "
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
