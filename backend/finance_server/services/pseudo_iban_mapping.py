"""Retroaktives Mapping von Karten-Pseudo-IBANs auf Zahlungspartner.

Kartenzahlungen werden beim Import in ``KARTE:<HÄNDLER>``-Pseudo-IBANs
umgeschrieben (siehe ``payroll_parsing.enrich_card_merchant``). Das Mapping
dieser Pseudo-IBAN auf einen vorhandenen Zahlungspartner wurde bisher nur vom
manuellen Skript ``scripts/migrate_card_transactions.py`` angelegt. Dieses
Modul macht das idempotent und ohne Überschreiben manueller Zuordnungen, damit
es beim Start, nach dem Sync und nach dem Import laufen kann.

Kein Sync-Log: die ``ibans``-Mapping-Zeile wird direkt geschrieben. Jedes Gerät
backfillt lokal; die Pseudo-IBAN selbst kommt über den normalen Sync-Pfad.
"""
from __future__ import annotations

import sqlite3
from typing import Iterable

CARD_PREFIX = "KARTE:"


def _normalize(value: str) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def find_partner(connection: sqlite3.Connection, merchant: str) -> int | None:
    """Fuzzy-Match eines Händlernamens auf einen vorhandenen Zahlungspartner.

    Längster Treffer gewinnt, bei Gleichstand der am weitesten vorne.
    """
    target = _normalize(merchant)
    best_id = None
    best_key = None
    for row in connection.execute("SELECT id, name FROM zahlungspartner"):
        name = _normalize(row["name"])
        if len(name) < 4:
            continue
        pos = target.find(name)
        if pos < 0:
            continue
        key = (pos, -len(name))
        if best_key is None or key < best_key:
            best_id, best_key = row["id"], key
    return best_id


def enrich_legacy_card_transactions(connection: sqlite3.Connection) -> int:
    """Schreibt ältere Norisbank-Kartenumsätze auf ``KARTE:<HÄNDLER>`` um.

    Betrifft nur Zeilen, deren ``applicant_iban`` noch keine Pseudo-IBAN ist.
    """
    from finance_server.db.utils import build_transaction_hash
    from finance_server.services.payroll_parsing import enrich_card_merchant

    rows = connection.execute(
        """
        SELECT * FROM umsaetze
        WHERE applicant_name LIKE '%KARTE%'
          AND COALESCE(applicant_iban, '') NOT LIKE 'KARTE:%'
        """
    ).fetchall()

    enriched = 0
    for row in rows:
        transaction = dict(row)
        enrich_card_merchant(transaction)
        if not (transaction.get("applicant_iban") or "").startswith(CARD_PREFIX):
            continue
        connection.execute(
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
                transaction["applicant_iban"],
                transaction["applicant_bic"],
                transaction["applicant_name"],
                transaction.get("gvc_applicant_iban"),
                transaction.get("gvc_applicant_bic"),
                build_transaction_hash(transaction),
                transaction["id"],
            ),
        )
        enriched += 1
    return enriched


def ensure_card_mappings(
    connection: sqlite3.Connection, ibans: Iterable[str] | None = None
) -> int:
    """Legt für Karten-Pseudo-IBANs ohne Mapping einen Zahlungspartner an.

    Vorhandene (ggf. manuell gesetzte) Mappings bleiben unangetastet.
    """
    if ibans is None:
        rows = connection.execute(
            "SELECT DISTINCT applicant_iban FROM umsaetze "
            "WHERE applicant_iban LIKE 'KARTE:%'"
        ).fetchall()
        candidates = [row["applicant_iban"] for row in rows]
    else:
        candidates = list(ibans)

    mapped = 0
    for iban in candidates:
        if not iban or not iban.startswith(CARD_PREFIX):
            continue
        exists = connection.execute(
            "SELECT 1 FROM ibans WHERE iban = ?", (iban,)
        ).fetchone()
        if exists:
            continue
        merchant = iban[len(CARD_PREFIX):].strip()
        if not merchant:
            continue
        partner_id = find_partner(connection, merchant)
        if partner_id is None:
            continue
        connection.execute(
            """
            INSERT INTO ibans (iban, f_zahlungspartner_id)
            VALUES (?, ?)
            ON CONFLICT(iban) DO NOTHING
            """,
            (iban, partner_id),
        )
        mapped += 1
    return mapped


def run_card_backfill() -> dict[str, int]:
    """Vollständiger Backfill mit eigener Verbindung (App-Start)."""
    from finance_server.core.database import get_connection

    with get_connection() as connection:
        enriched = enrich_legacy_card_transactions(connection)
        mapped = ensure_card_mappings(connection)
    return {"enriched": enriched, "mapped": mapped}
