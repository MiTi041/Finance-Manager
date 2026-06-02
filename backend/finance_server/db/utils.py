from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
import hashlib


def normalize_local_amount(raw_value: Any) -> float:
    if raw_value is None:
        return 0.0
    try:
        return float(Decimal(str(raw_value)))
    except Exception:
        return 0.0


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_iso_date(value: Any) -> str | None:
    text = normalize_text(value)
    if not text:
        return None

    if "T" in text:
        text = text.split("T", 1)[0]
    elif " " in text:
        text = text.split(" ", 1)[0]

    for pattern in (
        "%d.%m.%Y",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(text, pattern)
            return parsed.date().isoformat()
        except ValueError:
            continue

    return None


def build_transaction_hash(payload: dict[str, Any]) -> str:
    amt = payload.get("amount")
    orig_amt = payload.get("original_amount")

    stable_parts = [
        str(payload.get("account_iban") or ""),
        str(payload.get("account_bic") or ""),
        str(payload.get("account_accountnumber") or ""),
        str(payload.get("account_subaccount") or ""),
        str(payload.get("account_blz") or ""),
        str(payload.get("date") or ""),
        str(payload.get("entry_date") or ""),
        f"{amt:.4f}" if isinstance(amt, (int, float)) else "",
        f"{orig_amt:.4f}" if isinstance(orig_amt, (int, float)) else "",
        str(payload.get("currency") or ""),
        str(payload.get("transaction_id") or ""),
        str(payload.get("customer_reference") or ""),
        str(payload.get("bank_reference") or ""),
        str(payload.get("transaction_reference") or ""),
        str(payload.get("end_to_end_reference") or ""),
        str(payload.get("prima_nota") or ""),
        str(payload.get("applicant_iban") or ""),
        str(payload.get("applicant_bic") or ""),
        str(payload.get("applicant_name") or ""),
        str(payload.get("recipient_name") or ""),
        str(payload.get("purpose") or ""),
        str(payload.get("additional_purpose") or ""),
        str(payload.get("posting_text") or ""),
        str(payload.get("transaction_code") or ""),
        str(payload.get("purpose_code") or ""),
    ]

    raw = "|".join(stable_parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
