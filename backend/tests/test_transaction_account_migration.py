from unittest.mock import patch

import pytest

from finance_server.db.transactions import insert_transactions, migrate_transactions_to_account


def _setup_accounts(connection):
    connection.execute(
        "INSERT INTO bank_credentials (scope, payload, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ("sparkasse", b"{}", "2026-01-01", "2026-01-01"),
    )
    connection.execute(
        "INSERT INTO bank_accounts (scope, iban, account_name) VALUES (?, ?, ?)",
        ("sparkasse", "DE-SOURCE", "Sparkasse"),
    )
    connection.execute(
        "INSERT INTO bank_credentials (scope, payload, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ("norisbank", b"{}", "2026-01-01", "2026-01-01"),
    )
    connection.execute(
        "INSERT INTO bank_accounts (scope, iban, account_name) VALUES (?, ?, ?)",
        ("norisbank", "DE-TARGET", "Norisbank"),
    )


def _insert_transaction(connection, account_iban, transaction_hash, entry_date):
    return connection.execute(
        """
        INSERT INTO umsaetze (
            account_iban, amount, date, entry_date, created_at, transaction_hash,
            note, splits
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            account_iban,
            -25.0,
            entry_date,
            entry_date,
            f"{entry_date}T10:00:00",
            transaction_hash,
            "Meine Notiz",
            "[{\"betrag\": 25}]",
        ),
    ).lastrowid


def _run(connection, callback):
    with patch("finance_server.db.transactions.get_connection", return_value=connection), \
         patch("finance_server.db.transactions._log"):
        return callback()


def test_migrates_date_range_and_preserves_transaction_data(test_db):
    _setup_accounts(test_db)
    _insert_transaction(test_db, "DE-SOURCE", "stable-hash", "2026-06-15")
    _insert_transaction(test_db, "DE-SOURCE", "outside-range", "2025-06-15")
    test_db.commit()

    result = _run(
        test_db,
        lambda: migrate_transactions_to_account(
            "DE-SOURCE", "DE-TARGET", "2026-01-01", "2026-12-31", "Sparkasse"
        ),
    )

    row = test_db.execute(
        "SELECT * FROM umsaetze WHERE origin_account_iban = ?", ("DE-SOURCE",)
    ).fetchone()
    assert result["migrated"] == 1
    assert row["account_iban"] == "DE-TARGET"
    assert row["transaction_hash"] != "stable-hash"
    assert row["origin_transaction_hash"] == "stable-hash"
    assert row["origin_account_iban"] == "DE-SOURCE"
    assert row["origin_bank_name"] == "Sparkasse"
    assert row["migrated_at"]
    assert row["migration_batch_id"] == result["batch_id"]
    assert row["note"] == "Meine Notiz"
    assert row["splits"] == '[{"betrag": 25}]'

    outside = test_db.execute(
        "SELECT account_iban, origin_account_iban FROM umsaetze WHERE transaction_hash = 'outside-range'"
    ).fetchone()
    assert outside["account_iban"] == "DE-SOURCE"
    assert outside["origin_account_iban"] is None


def test_migrated_transaction_is_not_reimported_from_target_account(test_db):
    _setup_accounts(test_db)
    _insert_transaction(test_db, "DE-SOURCE", "stable-hash", "2026-06-15")
    test_db.commit()

    _run(
        test_db,
        lambda: migrate_transactions_to_account(
            "DE-SOURCE", "DE-TARGET", "2026-01-01", "2026-12-31"
        ),
    )

    with patch("finance_server.db.transactions.get_connection", return_value=test_db):
        result = insert_transactions(
            [
                {
                    "account": {"iban": "DE-TARGET"},
                    "data": {
                        "amount": -25.0,
                        "date": "2026-06-15",
                        "entry_date": "2026-06-15",
                        "transaction_id": "stable-hash",
                    },
                }
            ]
        )

    assert result == {"received": 1, "inserted": 0, "ignored": 1}
    assert test_db.execute("SELECT COUNT(*) FROM umsaetze").fetchone()[0] == 1


def test_migrated_transaction_is_not_reimported_from_source_account(test_db):
    _setup_accounts(test_db)
    _insert_transaction(test_db, "DE-SOURCE", "stable-hash", "2026-06-15")
    test_db.commit()

    _run(
        test_db,
        lambda: migrate_transactions_to_account(
            "DE-SOURCE", "DE-TARGET", "2026-01-01", "2026-12-31"
        ),
    )

    with patch("finance_server.db.transactions.get_connection", return_value=test_db):
        result = insert_transactions(
            [
                {
                    "account": {"iban": "DE-SOURCE"},
                    "data": {
                        "amount": -25.0,
                        "date": "2026-06-15",
                        "entry_date": "2026-06-15",
                        "transaction_id": "stable-hash",
                    },
                }
            ]
        )

    assert result == {"received": 1, "inserted": 0, "ignored": 1}
    assert test_db.execute("SELECT COUNT(*) FROM umsaetze").fetchone()[0] == 1


def test_rejects_repeated_migration_without_partial_update(test_db):
    _setup_accounts(test_db)
    first_id = _insert_transaction(test_db, "DE-SOURCE", "first", "2026-06-15")
    second_id = _insert_transaction(test_db, "DE-SOURCE", "second", "2026-06-16")
    test_db.commit()

    _run(
        test_db,
        lambda: migrate_transactions_to_account(
            "DE-SOURCE", "DE-TARGET", "2026-01-01", "2026-12-31", "Sparkasse"
        ),
    )

    with pytest.raises(ValueError, match="TRANSACTIONS_ALREADY_MIGRATED"):
        _run(
            test_db,
            lambda: migrate_transactions_to_account(
                "DE-SOURCE", "DE-TARGET", "2026-01-01", "2026-12-31", "Sparkasse"
            ),
        )

    rows = test_db.execute(
        "SELECT account_iban FROM umsaetze WHERE id IN (?, ?) ORDER BY id",
        (first_id, second_id),
    ).fetchall()
    assert [row["account_iban"] for row in rows] == ["DE-TARGET", "DE-TARGET"]


def test_rejects_unknown_target_before_touching_transactions(test_db):
    _setup_accounts(test_db)
    _insert_transaction(test_db, "DE-SOURCE", "stable-hash", "2026-06-15")
    test_db.commit()

    with pytest.raises(ValueError, match="TARGET_ACCOUNT_NOT_FOUND"):
        _run(
            test_db,
            lambda: migrate_transactions_to_account(
                "DE-SOURCE", "DE-UNKNOWN", "2026-01-01", "2026-12-31"
            ),
        )

    row = test_db.execute(
        "SELECT account_iban, origin_account_iban FROM umsaetze WHERE transaction_hash = ?",
        ("stable-hash",),
    ).fetchone()
    assert row["account_iban"] == "DE-SOURCE"
    assert row["origin_account_iban"] is None