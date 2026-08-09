from __future__ import annotations

import json
import sqlite3
from unittest.mock import patch

from finance_server.db.sync import apply_sync_op
from finance_server.db.transactions import to_row_payload
from finance_server.services.payroll_parsing import enrich_paypal_merchant


DEICHMANN = {
    "account_iban": "AT111",
    "applicant_name": "PayPal Europe S.a.r.l. et Cie S.C.A",
    "applicant_iban": "LU89751000135104200E",
    "applicant_bic": "PPLXLUL2",
    "purpose": "1052078269801/PP.6906.PP/. Deichmann SE, Ihr Einkauf bei Deichmann SE",
    "amount": -46.99,
    "dummy_entry": 0,
    "transaction_hash": "hash-deichmann",
    "created_at": "2026-08-04T00:00:00+00:00",
    "refund_total": 0,
}


class TestEnrichPaypalMerchant:
    def test_deichmann_gets_enriched(self):
        data = {
            "applicant_name": "PayPal Europe S.a.r.l. et Cie S.C.A",
            "applicant_iban": "LU89751000135104200E",
            "applicant_bic": "PPLXLUL2",
            "purpose": "1052078269801/PP.6906.PP/. Deichmann SE, Ihr Einkauf bei Deichmann SE",
        }
        enrich_paypal_merchant(data)
        assert data["applicant_name"] == "PAYPAL Deichmann SE"
        assert data["applicant_iban"] == "PAYPAL:DEICHMANN SE"
        assert data["applicant_bic"] == ""
        assert data["gvc_applicant_iban"] == "LU89751000135104200E"
        assert data["gvc_applicant_bic"] == "PPLXLUL2"

    def test_non_paypal_untouched(self):
        data = {"applicant_name": "DEICHMANN SCHUHE", "applicant_iban": "DE86300500000001052141"}
        enrich_paypal_merchant(data)
        assert data["applicant_iban"] == "DE86300500000001052141"
        assert "gvc_applicant_iban" not in data


class TestToRowPayload:
    def test_deichmann_enriched_through_insert_funnel(self):
        payload = to_row_payload(
            {"account": {"iban": "AT111"}, "data": dict(DEICHMANN)}
        )
        assert payload["applicant_name"] == "PAYPAL Deichmann SE"
        assert payload["applicant_iban"] == "PAYPAL:DEICHMANN SE"
        assert payload["gvc_applicant_iban"] == "LU89751000135104200E"
        assert payload["gvc_applicant_bic"] == "PPLXLUL2"


def _op(data: dict) -> dict:
    return {
        "table_name": "umsaetze",
        "row_id": 1,
        "op_type": "INSERT",
        "data": json.dumps({"id": 1, **data}),
    }


class TestApplySyncOp:
    def test_deichmann_enriched_on_device_sync(self, test_db: sqlite3.Connection):
        with patch("finance_server.db.sync.get_connection", return_value=test_db):
            ok = apply_sync_op(_op(dict(DEICHMANN)))
        assert ok
        row = test_db.execute("SELECT * FROM umsaetze").fetchone()
        assert row["applicant_name"] == "PAYPAL Deichmann SE"
        assert row["applicant_iban"] == "PAYPAL:DEICHMANN SE"