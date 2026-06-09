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
from finance_server.services.payroll_parsing import (
    PAYPAL_PAYEE_REGEX,
    extract_paypal_merchant,
    build_paypal_pseud_iban,
)


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

            if not PAYPAL_PAYEE_REGEX.match(tx.get("applicant_name", "")):
                stats["no_merchant"] += 1
                continue

            merchant = extract_paypal_merchant(tx.get("purpose", ""))
            if not merchant:
                stats["no_merchant"] += 1
                continue

            pseud_iban = build_paypal_pseud_iban(merchant)
            new_name = f"PAYPAL {merchant}"
            old_iban = tx["applicant_iban"]

            tx["applicant_iban"] = pseud_iban
            tx["applicant_bic"] = ""
            tx["applicant_name"] = new_name
            if not tx.get("gvc_applicant_iban"):
                tx["gvc_applicant_iban"] = old_iban

            new_hash = build_transaction_hash(tx)

            conn.execute(
                """
                UPDATE umsaetze SET
                    applicant_iban = ?,
                    applicant_name = ?,
                    gvc_applicant_iban = ?,
                    transaction_hash = ?
                WHERE id = ?
                """,
                (pseud_iban, new_name, tx["gvc_applicant_iban"], new_hash, tx["id"]),
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
