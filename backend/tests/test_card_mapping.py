from __future__ import annotations

from finance_server.services.pseudo_iban_mapping import (
    enrich_legacy_card_transactions,
    ensure_card_mappings,
)

RAW_CARD_IBAN = "DE24100777770004020400"
MERCHANT = "ZZTESTHAENDLER QX"
PURPOSE = (
    f"{MERCHANT}//LEMGO/DE 18-09-2026T19:55:34 Kartennr. 5354999999996211"
)


def _insert_raw_card(conn) -> None:
    conn.execute(
        """
        INSERT INTO umsaetze (
            account_iban, amount, applicant_name, applicant_iban, applicant_bic,
            purpose, transaction_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("DE1", -1.0, "NORISBANK DEBITKARTE", RAW_CARD_IBAN, "PBNKDEFF", PURPOSE, "h-raw"),
    )


def test_backfill_enriches_card_and_maps_partner(test_db):
    partner_id = test_db.execute(
        "INSERT INTO zahlungspartner (name) VALUES (?)", (MERCHANT,)
    ).lastrowid
    _insert_raw_card(test_db)

    assert enrich_legacy_card_transactions(test_db) == 1
    test_db.commit()

    row = test_db.execute(
        "SELECT applicant_iban, applicant_name FROM umsaetze WHERE purpose = ?", (PURPOSE,)
    ).fetchone()
    assert row["applicant_iban"] == f"KARTE:{MERCHANT}"
    assert row["applicant_name"] == f"KARTE {MERCHANT}"

    assert ensure_card_mappings(test_db) == 1
    test_db.commit()

    link = test_db.execute(
        "SELECT f_zahlungspartner_id FROM ibans WHERE iban = ?",
        (row["applicant_iban"],),
    ).fetchone()
    assert link["f_zahlungspartner_id"] == partner_id


def test_ensure_does_not_overwrite_manual_mapping(test_db):
    manual_id = test_db.execute(
        "INSERT INTO zahlungspartner (name) VALUES ('Manuell')"
    ).lastrowid
    test_db.execute(
        "INSERT INTO umsaetze (account_iban, amount, applicant_iban, transaction_hash) "
        "VALUES ('DE1', -1.0, ?, 'h-pseudo')",
        (f"KARTE:{MERCHANT}",),
    )
    test_db.execute(
        "INSERT INTO ibans (iban, f_zahlungspartner_id) VALUES (?, ?)",
        (f"KARTE:{MERCHANT}", manual_id),
    )
    test_db.commit()

    assert ensure_card_mappings(test_db) == 0
    test_db.commit()

    link = test_db.execute(
        "SELECT f_zahlungspartner_id FROM ibans WHERE iban = ?",
        (f"KARTE:{MERCHANT}",),
    ).fetchone()
    assert link["f_zahlungspartner_id"] == manual_id


def test_backfill_is_idempotent(test_db):
    test_db.execute("INSERT INTO zahlungspartner (name) VALUES (?)", (MERCHANT,))
    _insert_raw_card(test_db)
    test_db.commit()

    enrich_legacy_card_transactions(test_db)
    ensure_card_mappings(test_db)
    test_db.commit()

    assert enrich_legacy_card_transactions(test_db) == 0
    assert ensure_card_mappings(test_db) == 0
