#!/usr/bin/env python3
"""Migrate existing PayPal transactions to use pseud-IBANs.

Run from repository root:
  python backend/finance_server/scripts/migrate_paypal_transactions.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from finance_server.db import get_connection
from finance_server.db.utils import build_transaction_hash
from finance_server.services.payroll_parsing import enrich_paypal_merchant


def migrate_paypal_transactions() -> dict[str, int]:
    stats = {"checked": 0, "migrated": 0, "no_merchant": 0, "already_done": 0}

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM umsaetze WHERE applicant_name LIKE '%PayPal%'"
        ).fetchall()

        for row in rows:
            tx = dict(row)
            stats["checked"] += 1

            if tx["applicant_iban"].startswith("PAYPAL:"):
                stats["already_done"] += 1
                continue

            enrich_paypal_merchant(tx)
            if not tx["applicant_iban"].startswith("PAYPAL:"):
                stats["no_merchant"] += 1
                continue

            new_hash = build_transaction_hash(tx)

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
                    new_hash,
                    tx["id"],
                ),
            )
            stats["migrated"] += 1

    return stats


def main() -> int:
    stats = migrate_paypal_transactions()
    print(
        f"PayPal-Migration: {stats['checked']} geprüft, "
        f"{stats['migrated']} migriert, "
        f"{stats['no_merchant']} ohne Merchant (übersprungen), "
        f"{stats['already_done']} bereits erledigt"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
