from __future__ import annotations

import re

PAYPAL_PAYEE_REGEX = re.compile(r"(?i)^\s*PAYPAL\b")

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


def build_paypal_pseud_iban(merchant: str) -> str:
    normalized = re.sub(r"\s+", " ", merchant).strip().upper()
    return f"PAYPAL:{normalized}"


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
