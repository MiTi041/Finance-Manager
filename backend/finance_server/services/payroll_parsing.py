from __future__ import annotations

import re

PAYPAL_PAYEE_REGEX = re.compile(r"(?i)^\s*PAYPAL\b")

ADYEN_PAYEE_REGEX = re.compile(r"(?i)^\s*ADYEN(?:\s*N\.?\s*V\.?)?\s*$")

# Kartenzahlungen belasten nicht den Händler, sondern das Konto der Karte
# ("NORISBANK DEBITKARTE" / "ABRECHNUNG KARTE"). Der Händler steht als erstes
# Segment im Verwendungszweck: "SUBWAY69009-0//BIELEFELD/DE 18-09-2026T19:55:34
# Kartennr. 5297999999995777". "Lastschrift aus Kartenzahlung" ist die
# monatliche Abrechnung und enthält keinen Händler – wird bewusst nicht gematcht.
CARD_PAYEE_REGEX = re.compile(
    r"(?i)^\s*(?:NORISBANK\s+DEBITKARTE|ABRECHNUNG\s+KARTE)\s*$"
)

CARD_MERCHANT_REGEX = re.compile(r"^\s*(.+?)//[^/]*/[A-Za-z]{2}\s+\d{2}-\d{2}-\d{4}T")

PAYPAL_MEMO_REGEX = re.compile(
    r"(?:,\s*Ihr\s*Einkauf\s*bei\s*|PAYPAL[.\-]?ZAHLUNG\s*UBER\s*LASTSCHRIFT\s*an\s*)(.+?)(?:\s*/\s*ABBUCHUNG|\s+ABBUCHUNG|/\s*|$)",
    re.IGNORECASE | re.DOTALL,
)

ABBUCHUNG_CLEANUP = re.compile(
    r"\s*/\s*ABBUCHUNG.*|\s+ABBUCHUNG.*", re.IGNORECASE | re.DOTALL
)


def extract_paypal_merchant(purpose: str) -> str | None:
    match = PAYPAL_MEMO_REGEX.search(purpose)
    if not match:
        return None
    merchant = match.group(1).strip()
    merchant = ABBUCHUNG_CLEANUP.sub("", merchant).strip()
    return merchant if merchant else None


def extract_adyen_merchant(deviate_applicant: str) -> str | None:
    # Bank liefert "Händler/Straße/Ort/DE" – erstes Segment ist der echte Empfänger.
    merchant = (deviate_applicant or "").split("/", 1)[0].strip()
    return merchant if merchant else None


def extract_card_merchant(purpose: str) -> str | None:
    match = CARD_MERCHANT_REGEX.match(purpose or "")
    if not match:
        return None
    merchant = re.sub(r"\s+", " ", match.group(1)).strip()
    return merchant if merchant else None


def _build_pseud_iban(prefix: str, merchant: str) -> str:
    normalized = re.sub(r"\s+", " ", merchant).strip().upper()
    return f"{prefix}:{normalized}"


def build_paypal_pseud_iban(merchant: str) -> str:
    return _build_pseud_iban("PAYPAL", merchant)


def build_adyen_pseud_iban(merchant: str) -> str:
    return _build_pseud_iban("ADYEN", merchant)


def build_card_pseud_iban(merchant: str) -> str:
    return _build_pseud_iban("KARTE", merchant)


def enrich_paypal_merchant(transaction_data: dict) -> dict:
    applicant_name = transaction_data.get("applicant_name", "")
    if not applicant_name or not PAYPAL_PAYEE_REGEX.match(applicant_name):
        return transaction_data

    purpose = transaction_data.get("purpose", "")
    merchant = extract_paypal_merchant(purpose)
    if not merchant:
        return transaction_data

    pseud_iban = build_paypal_pseud_iban(merchant)
    real_paypal_iban = transaction_data.get("applicant_iban", "")
    real_paypal_bic = transaction_data.get("applicant_bic", "")

    if not transaction_data.get("gvc_applicant_iban"):
        transaction_data["gvc_applicant_iban"] = real_paypal_iban
    if not transaction_data.get("gvc_applicant_bic"):
        transaction_data["gvc_applicant_bic"] = real_paypal_bic

    transaction_data["applicant_iban"] = pseud_iban
    transaction_data["applicant_bic"] = ""
    transaction_data["applicant_name"] = f"PAYPAL {merchant}"

    return transaction_data


def enrich_adyen_merchant(transaction_data: dict) -> dict:
    applicant_name = transaction_data.get("applicant_name", "")
    if not applicant_name or not ADYEN_PAYEE_REGEX.match(applicant_name):
        return transaction_data

    merchant = extract_adyen_merchant(transaction_data.get("deviate_applicant", ""))
    if not merchant:
        return transaction_data

    pseud_iban = build_adyen_pseud_iban(merchant)
    real_adyen_iban = transaction_data.get("applicant_iban", "")
    real_adyen_bic = transaction_data.get("applicant_bic", "")

    if not transaction_data.get("gvc_applicant_iban"):
        transaction_data["gvc_applicant_iban"] = real_adyen_iban
    if not transaction_data.get("gvc_applicant_bic"):
        transaction_data["gvc_applicant_bic"] = real_adyen_bic

    transaction_data["applicant_iban"] = pseud_iban
    transaction_data["applicant_bic"] = ""
    transaction_data["applicant_name"] = f"ADYEN {merchant}"

    return transaction_data


def enrich_card_merchant(transaction_data: dict) -> dict:
    applicant_name = transaction_data.get("applicant_name", "")
    if not applicant_name or not CARD_PAYEE_REGEX.match(applicant_name):
        return transaction_data

    merchant = extract_card_merchant(transaction_data.get("purpose", ""))
    if not merchant:
        return transaction_data

    pseud_iban = build_card_pseud_iban(merchant)
    real_card_iban = transaction_data.get("applicant_iban", "")
    real_card_bic = transaction_data.get("applicant_bic", "")

    if not transaction_data.get("gvc_applicant_iban"):
        transaction_data["gvc_applicant_iban"] = real_card_iban
    if not transaction_data.get("gvc_applicant_bic"):
        transaction_data["gvc_applicant_bic"] = real_card_bic

    transaction_data["applicant_iban"] = pseud_iban
    transaction_data["applicant_bic"] = ""
    transaction_data["applicant_name"] = f"KARTE {merchant}"

    return transaction_data


def enrich_transaction(transaction_data: dict) -> dict:
    enrich_paypal_merchant(transaction_data)
    enrich_adyen_merchant(transaction_data)
    enrich_card_merchant(transaction_data)
    return transaction_data
