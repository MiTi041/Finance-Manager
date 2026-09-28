from __future__ import annotations

import json
import sqlite3
from unittest.mock import patch

from finance_server.db.sync import apply_sync_op
from finance_server.db.transactions import to_row_payload
from finance_server.services.payroll_parsing import (
    enrich_adyen_merchant,
    enrich_card_merchant,
    enrich_paypal_merchant,
)


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


class TestEnrichAdyenMerchant:
    def test_zalando_gets_enriched(self):
        data = {
            "applicant_name": "Adyen N.V.",
            "applicant_iban": "DE29300600100005021573",
            "applicant_bic": "GENODEDDXXX",
            "deviate_applicant": "Zalando Payments GmbH/Hedwig-Wachenheim-Str./Berlin/DE",
        }
        enrich_adyen_merchant(data)
        assert data["applicant_name"] == "ADYEN Zalando Payments GmbH"
        assert data["applicant_iban"] == "ADYEN:ZALANDO PAYMENTS GMBH"
        assert data["applicant_bic"] == ""
        assert data["gvc_applicant_iban"] == "DE29300600100005021573"
        assert data["gvc_applicant_bic"] == "GENODEDDXXX"

    def test_variant_without_spaces(self):
        data = {
            "applicant_name": "AdyenN.V.",
            "applicant_iban": "DE29300600100005021573",
            "applicant_bic": "GENODEDDXXX",
            "deviate_applicant": "Autogrill Deutschland/Flughafen/Cologne/DE",
        }
        enrich_adyen_merchant(data)
        assert data["applicant_name"] == "ADYEN Autogrill Deutschland"
        assert data["applicant_iban"] == "ADYEN:AUTOGRILL DEUTSCHLAND"

    def test_missing_deviate_applicant_untouched(self):
        data = {
            "applicant_name": "Adyen N.V.",
            "applicant_iban": "DE29300600100005021573",
            "applicant_bic": "GENODEDDXXX",
            "deviate_applicant": "",
        }
        enrich_adyen_merchant(data)
        assert data["applicant_name"] == "Adyen N.V."
        assert data["applicant_iban"] == "DE29300600100005021573"
        assert "gvc_applicant_iban" not in data

    def test_non_adyen_untouched(self):
        data = {"applicant_name": "DEICHMANN SCHUHE", "applicant_iban": "DE86300500000001052141"}
        enrich_adyen_merchant(data)
        assert data["applicant_iban"] == "DE86300500000001052141"

    def test_adyen_enriched_through_insert_funnel(self):
        payload = to_row_payload(
            {
                "account": {"iban": "AT111"},
                "data": {
                    "account_iban": "AT111",
                    "applicant_name": "Adyen N.V.",
                    "applicant_iban": "DE29300600100005021573",
                    "applicant_bic": "GENODEDDXXX",
                    "deviate_applicant": "Zalando Payments GmbH/Hedwig-Wachenheim-Str./Berlin/DE",
                    "purpose": "2026-09-14T12.14Debitk.22 2026-12",
                    "amount": -62.65,
                    "currency": "EUR",
                    "date": "2026-09-15",
                },
            }
        )
        assert payload["applicant_name"] == "ADYEN Zalando Payments GmbH"
        assert payload["applicant_iban"] == "ADYEN:ZALANDO PAYMENTS GMBH"
        assert payload["gvc_applicant_iban"] == "DE29300600100005021573"
        assert payload["gvc_applicant_bic"] == "GENODEDDXXX"


class TestEnrichCardMerchant:
    def test_abrechnung_karte_gets_enriched(self):
        data = {
            "applicant_name": "ABRECHNUNG KARTE",
            "applicant_iban": "DE77100777770999974900",
            "applicant_bic": "NORISDEFFXXX",
            "purpose": "SUBWAY69009-0//BIELEFELD/DE 18-09-2026T19:55:34 Kartennr. 5297999999995777",
        }
        enrich_card_merchant(data)
        assert data["applicant_name"] == "KARTE SUBWAY69009-0"
        assert data["applicant_iban"] == "KARTE:SUBWAY69009-0"
        assert data["applicant_bic"] == ""
        assert data["gvc_applicant_iban"] == "DE77100777770999974900"
        assert data["gvc_applicant_bic"] == "NORISDEFFXXX"
        # Verwendungszweck bleibt vollständig erhalten (Kartennr. + Fremdwährung)
        assert "Kartennr. 5297999999995777" in data["purpose"]

    def test_norisbank_debitkarte_keeps_purpose_tail(self):
        data = {
            "applicant_name": "NORISBANK DEBITKARTE",
            "applicant_iban": "DE24100777770004020400",
            "applicant_bic": "",
            "purpose": (
                "DeepSeek//HONG KONG/HK 24-09-2026T23:18:00 Kartennr. 5354999999996211"
                "  Original 2,12 USD 1 EUR/1,13368 USD Entgelt 0,02 EUR"
            ),
        }
        enrich_card_merchant(data)
        assert data["applicant_iban"] == "KARTE:DEEPSEEK"
        assert data["applicant_name"] == "KARTE DeepSeek"

    def test_card_settlement_without_merchant_untouched(self):
        data = {
            "applicant_name": "Lastschrift aus Kartenzahlung",
            "applicant_iban": "DE24100777770004020400",
            "purpose": "2023-07-03T22:29      Debitk.17 2026-12",
        }
        enrich_card_merchant(data)
        assert data["applicant_name"] == "Lastschrift aus Kartenzahlung"
        assert data["applicant_iban"] == "DE24100777770004020400"
        assert "gvc_applicant_iban" not in data

    def test_non_card_payee_untouched(self):
        data = {
            "applicant_name": "Adyen N.V.",
            "applicant_iban": "DE29300600100005021573",
            "purpose": "Zalando Payments GmbH/Berlin/DE 18-09-2026T19:55:34",
        }
        enrich_card_merchant(data)
        assert data["applicant_iban"] == "DE29300600100005021573"
        assert "gvc_applicant_iban" not in data

    def test_card_enriched_through_insert_funnel(self):
        payload = to_row_payload(
            {
                "account": {"iban": "AT111"},
                "data": {
                    "account_iban": "AT111",
                    "applicant_name": "ABRECHNUNG KARTE",
                    "applicant_iban": "DE77100777770999974900",
                    "applicant_bic": "NORISDEFFXXX",
                    "purpose": "REWE Regiemarkt Gm//Leopoldshoehe/DE 24-09-2026T20:10:01 Kartennr. 5354999999996211",
                    "amount": -6.76,
                    "currency": "EUR",
                    "date": "2026-09-28",
                },
            }
        )
        assert payload["applicant_name"] == "KARTE REWE Regiemarkt Gm"
        assert payload["applicant_iban"] == "KARTE:REWE REGIEMARKT GM"
        assert payload["gvc_applicant_iban"] == "DE77100777770999974900"


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