from __future__ import annotations

from unittest.mock import patch

from finance_server.services import csv_import_service

C24_HEADER = (
    "Transaktionstyp,Buchungsdatum,Karteneinsatz,Betrag,Zahlungsempfänger,IBAN,BIC,"
    "Verwendungszweck,Beschreibung,Kontonummer,Kontoname,Kategorie,Unterkategorie,"
    "Bargeldabhebung\n"
)
C24_ROW = (
    "Echtzeit-Überweisung,24.09.2026,,0,01 €,Michael Tissen,DE18760260000037114600,"
    "NORSDE71XXX,Test,,2994388301,C24 Smartkonto,Weitere Einnahmen,Weitere Einnahmen,\n"
)
C24_EMPTY_ROW = ",,,,,,,,,,,,,,\n"


def test_parse_c24_maps_columns():
    with patch.object(
        csv_import_service,
        "list_categories",
        return_value=[{"id": 3, "name": "Weitere Einnahmen"}],
    ):
        rows = csv_import_service.parse_csv(
            (C24_HEADER + C24_ROW + C24_EMPTY_ROW).encode("utf-8"),
            "c24",
            "DE02120300000000202051",
        )
    assert len(rows) == 1
    row = rows[0]
    assert row["date"] == "2026-09-24"
    assert row["amount"] == 0.01
    assert row["recipient_name"] == "Michael Tissen"
    assert row["recipient_iban"] == "DE18760260000037114600"
    assert row["purpose"] == "Test"
    assert row["category"] == 3
    assert row["status"] == "ok"


def test_parse_marks_invalid_rows():
    text = C24_HEADER + "Echtzeit-Überweisung,,,0,00 €,X,,,Y,,,Konto,A,B,\n"
    with patch.object(csv_import_service, "list_categories", return_value=[]):
        rows = csv_import_service.parse_csv(
            text.encode("utf-8"), "c24", "DE02120300000000202051"
        )
    assert rows[0]["status"] == "invalid"
    assert rows[0]["error"]


def test_parse_amount_formats():
    assert csv_import_service.parse_amount("-12,34") == -12.34
    assert csv_import_service.parse_amount("1.234,56 €") == 1234.56
    assert csv_import_service.parse_amount("1234.56") == 1234.56
    assert csv_import_service.parse_amount("") is None


def test_generic_schema_maps_english_headers():
    text = "date,amount,recipient_name,purpose,note\n2026-03-05,-5.00,Alice,Miete,Notiz\n"
    with patch.object(csv_import_service, "list_categories", return_value=[]):
        rows = csv_import_service.parse_csv(
            text.encode("utf-8"), "generic", "DE02120300000000202051"
        )
    assert rows[0]["recipient_name"] == "Alice"
    assert rows[0]["amount"] == -5.0
    assert rows[0]["purpose"] == "Miete"


def test_preview_marks_duplicates():
    with patch.object(csv_import_service, "list_categories", return_value=[]), patch.object(
        csv_import_service,
        "existing_transaction_hashes",
        side_effect=lambda hashes: set(hashes),
    ):
        result = csv_import_service.preview_csv(
            (C24_HEADER + C24_ROW).encode("utf-8"), "c24", "DE02120300000000202051"
        )
    assert result["rows"][0]["status"] == "duplicate"
    assert result["counts"] == {"total": 1, "ok": 0, "duplicate": 1, "invalid": 0}


def test_import_csv_rejects_non_manual_account():
    with patch(
        "finance_server.services.csv_import_service.load_bank_credentials_by_iban",
        return_value={"bank_key": "comdirect"},
    ):
        try:
            csv_import_service.import_csv("DE02120300000000202051", [])
            assert False, "expected ValueError"
        except ValueError as err:
            assert str(err) == "MANUAL_ACCOUNT_REQUIRED"


def test_import_csv_inserts_manual_rows():
    captured: dict = {}

    def fake_insert(rows):
        captured["rows"] = list(rows)
        return {
            "received": len(captured["rows"]),
            "inserted": len(captured["rows"]),
            "ignored": 0,
        }

    with patch(
        "finance_server.services.csv_import_service.load_bank_credentials_by_iban",
        return_value={"bank_key": "manual"},
    ), patch(
        "finance_server.services.csv_import_service.insert_transactions",
        side_effect=fake_insert,
    ):
        result = csv_import_service.import_csv(
            "DE02120300000000202051",
            [
                {
                    "date": "2026-03-05",
                    "amount": -12.34,
                    "transaction_id": "manual-csv-abc",
                    "status": "ok",
                }
            ],
        )
    assert result["inserted"] == 1
    assert captured["rows"][0]["data"]["dummy_entry"] is True
    assert captured["rows"][0]["data"]["id"] == "manual-csv-abc"


def test_parse_generic_with_german_amount():
    with patch.object(csv_import_service, "list_categories", return_value=[]):
        rows = csv_import_service.parse_csv(
            (C24_HEADER + C24_ROW).encode("utf-8"), "generic", "DE02120300000000202051"
        )
    assert rows[0]["amount"] == 0.01
    assert rows[0]["recipient_name"] == "Michael Tissen"
    assert rows[0]["recipient_iban"] == "DE18760260000037114600"
    assert rows[0]["status"] == "ok"


def test_parse_c24_amount_without_currency():
    row = (
        "Echtzeit-Überweisung,24.09.2026,,-0,01,Michael Tissen,DE18760260000037114600,"
        "NORSDE71XXX,Test,,2994388301,C24 Smartkonto,Weitere Ausgaben,Weitere Ausgaben,\n"
    )
    with patch.object(csv_import_service, "list_categories", return_value=[]):
        rows = csv_import_service.parse_csv(
            (C24_HEADER + row).encode("utf-8"), "c24", "DE02120300000000202051"
        )
    assert rows[0]["amount"] == -0.01
    assert rows[0]["recipient_name"] == "Michael Tissen"
    assert rows[0]["status"] == "ok"


def test_parse_c24_space_thousands():
    row = (
        "Echtzeit-Überweisung,24.09.2026,,-1 234,56 €,Michael Tissen,DE18760260000037114600,"
        "NORSDE71XXX,Test,,2994388301,C24 Smartkonto,Weitere Ausgaben,Weitere Ausgaben,\n"
    )
    with patch.object(csv_import_service, "list_categories", return_value=[]):
        rows = csv_import_service.parse_csv(
            (C24_HEADER + row).encode("utf-8"), "c24", "DE02120300000000202051"
        )
    assert rows[0]["amount"] == -1234.56
    assert rows[0]["recipient_name"] == "Michael Tissen"
    assert rows[0]["status"] == "ok"


def test_normalize_amount_fields_leaves_quoted_and_us_amounts():
    text = 'a,"-0,01 €",1,234.56,b\n'
    assert csv_import_service._normalize_amount_fields(text) == text
