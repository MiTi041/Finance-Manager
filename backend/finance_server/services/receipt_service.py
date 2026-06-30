from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from finance_server.db.receipts import (
    delete_receipt as db_delete_receipt,
    delete_receipts_for_transaction as db_delete_receipts_for_transaction,
    fetch_receipt as db_fetch_receipt,
    fetch_receipts_for_transaction as db_fetch_receipts_for_transaction,
    insert_receipt as db_insert_receipt,
)

logger = logging.getLogger(__name__)

_EAN_LINE = re.compile(r"(?:art|ean)\s*[/:]\s*\d", re.IGNORECASE)
_TOTAL_LINE = re.compile(
    r"(?:summe|sunme|sume|summ|gesamt|total|bar|karte|zahlung)", re.IGNORECASE
)
_SKIP_LINE_START = re.compile(
    r"^(?:eur\b|€|steuer|mwst|ust|stnr|terminal|ta-nr|vu-nr|pan|emv|"
    r"mitarbeiter|kasse|steuernummer|umsatzsteuer)", re.IGNORECASE
)
_WEIGHT_PATTERN = re.compile(r"^\d+\s*[gkgmlldcl]+\s", re.IGNORECASE)


def _extract_line_items(text: str) -> list[dict[str, Any]]:
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return []

    total_idx = len(lines)
    for i, line in enumerate(lines):
        if _TOTAL_LINE.search(line):
            total_idx = i
            break

    items: list[dict[str, Any]] = []
    pending_name: str | None = None

    def _is_single_noise(line: str) -> bool:
        return bool(re.match(r"^[\W_\d]{1,3}$", line.strip()))

    _price_cache: list[tuple[str, float, bool]] = []

    def _find_prices(raw: str) -> list[tuple[str, float, bool]]:
        results: list[tuple[str, float, bool]] = []
        for pat, has_currency in [
            (r"(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*(EUR|€)", True),
            (r"(EUR|€)\s*(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})", True),
            (r"(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*$", False),
        ]:
            for m in re.finditer(pat, raw, re.IGNORECASE):
                price_raw = m.group(1) if m.lastindex == 2 else m.group(1)
                try:
                    price = _parse_decimal(price_raw)
                except ValueError:
                    continue
                if price <= 0 or price >= 100000:
                    continue
                before = raw[: m.start()].strip()
                before = re.sub(r"[\W_]+$", "", before).strip()
                results.append((before, price, has_currency))
        return results

    def _find_price(raw: str) -> tuple[str, float] | None:
        results = _find_prices(raw)
        if not results:
            return None
        prefixed = [(b, p) for b, p, c in results if c]
        return prefixed[0] if prefixed else (results[0][0], results[0][1])

    def _clean(name: str) -> str:
        name = re.sub(r"^[\W_~]+|[\W_~]+$", "", name)
        name = re.sub(r"\s+", " ", name).strip()
        if len(name) <= 1:
            return ""
        if re.match(r"^[\d\s,.\-–—/:;]+$", name):
            return ""
        return name

    _WEIGHT_PRICE_LINE = re.compile(
        r"\d+\s*[gkgmlldcl]+\s+\d+[.,]\d", re.IGNORECASE
    )
    _WEIGHT_ONLY = re.compile(r"^\d+\s*[gkgmlldcl]+\s*$", re.IGNORECASE)

    for line in lines[:total_idx]:
        raw = line.strip()
        if not raw:
            continue
        if _EAN_LINE.match(raw):
            continue
        if _is_address_line(raw):
            continue
        if _SKIP_LINE_START.match(raw):
            continue
        if _is_single_noise(raw):
            continue

        if _WEIGHT_PRICE_LINE.match(raw):
            continue

        result = _find_price(raw)

        if result:
            before, price = result
            before_clean = _clean(before)

            if before_clean and not _WEIGHT_ONLY.match(before_clean):
                items.append({"name": before_clean, "price": round(price, 2)})
                pending_name = before_clean
            elif pending_name and before_clean:
                items.append({"name": pending_name, "price": round(price, 2)})
                pending_name = None
            elif pending_name and not before_clean:
                items.append({"name": pending_name, "price": round(price, 2)})
                pending_name = None
            else:
                pending_name = before_clean or pending_name
            continue

        cleaned = _clean(raw)
        if cleaned and not _WEIGHT_ONLY.match(cleaned):
            pending_name = cleaned

    return items


_SKIP_STORE_KEYWORDS = {
    "mwst", "ust", "steuer", "summe", "sume", "summ", "sunme", "sunn",
    "gesamt", "total", "betrag", "bar", "karte", "ec", "visa",
    "mastercard", "geld", "zurück", "wechsel", "datum", "date",
    "zeit", "uhr", "mitarbeiter", "kasse", "bon", "quittung",
    "beleg", "rechnung", "steuernummer", "umsatzsteuer", "tel",
    "telefon", "fax", "email", "www", "http", "terminal",
}

_ADDRESS_PATTERN = re.compile(
    r"\d{5}\s+|str(?:\.|aße)\s|weg\s|allee\s|platz\s|ring\s", re.IGNORECASE
)

_COMPANY_SUFFIX = re.compile(r"(?:GmbH|AG|e\.?[Kk]\.?|e\.?V\.?|KG|SE|Co\.?\s*KG|mbH|OHG)", re.IGNORECASE)


def _is_address_line(line: str) -> bool:
    return bool(_ADDRESS_PATTERN.search(line)) or (
        bool(re.search(r"\d+[a-z]?\s", line))
        and any(w in line.lower() for w in ["str", "str.", "straße", "weg", "allee", "platz"])
    )


def _is_receipt_noise(line: str) -> bool:
    clean = re.sub(r"[^a-zA-ZäöüßÄÖÜ0-9]", "", line)
    if len(clean) <= 2:
        return True
    lower = line.lower()
    for kw in _SKIP_STORE_KEYWORDS:
        if kw in lower:
            return True
    if re.match(r"^[\d\s,.\-–—/:;]+$", line.strip()):
        return True
    return False


def _extract_store_name(text: str) -> str | None:
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    candidates: list[str] = []
    for line in lines[:25]:
        if _is_receipt_noise(line):
            continue
        if _is_address_line(line):
            continue
        cleaned = re.sub(r"[^a-zA-ZäöüßÄÖÜ0-9\s\-&.,]", "", line).strip()
        if len(cleaned) > 2 and not re.match(r"^\d", cleaned):
            candidates.append(cleaned)

    if not candidates:
        return None

    name = candidates[0]
    if len(name) < 25 and len(candidates) > 1 and _COMPANY_SUFFIX.search(candidates[1]):
        name += " " + candidates[1]

    return name[0].upper() + name[1:] if name else None


def _parse_decimal(raw: str) -> float:
    raw = raw.strip()
    if not raw:
        raise ValueError
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        parts = raw.split(".")
        if len(parts) == 2 and len(parts[1]) in (2, 3):
            pass
        else:
            raw = raw.replace(".", "")
    return float(raw)


def _extract_total_amount(text: str) -> float | None:
    lines = text.strip().split("\n")
    mid = len(lines) // 2
    relevant = "\n".join(lines[mid:])
    candidates: list[float] = []

    keyword_patterns = [
        r"(?:SUMME|SUNME|SUMM|SUNM|GESAMT(?:BETRAG)?|TOTAL|ZAHLEN|BETRAG|BAR|KARTE|EC)[:\s]*(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})",
        r"(?:SUMME|SUNME|SUMM|SUNM|GESAMT(?:BETRAG)?|TOTAL|ZAHLEN|BETRAG)[:\s]{0,5}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})",
    ]
    for pat in keyword_patterns:
        for match in re.finditer(pat, relevant, re.IGNORECASE | re.MULTILINE):
            try:
                candidates.append(_parse_decimal(match.group(1)))
            except ValueError:
                pass

    if not candidates:
        amount_currency_patterns = [
            r"(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*(?:EUR|€)",
            r"(?:EUR|€)\s*(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})",
            r"(?:EUR|€)\s*\[[\s\d]+\]\s*(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})",
        ]
        for pat in amount_currency_patterns:
            for match in re.finditer(pat, relevant, re.IGNORECASE | re.MULTILINE):
                try:
                    candidates.append(_parse_decimal(match.group(1)))
                except ValueError:
                    pass

    if not candidates:
        amount_only_pat = r"(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})"
        for match in re.finditer(amount_only_pat, relevant, re.MULTILINE):
            try:
                candidates.append(_parse_decimal(match.group(1)))
            except ValueError:
                pass

    if candidates:
        val = max(candidates)
        return val if val < 999999 else None
    return None


def _extract_date(text: str) -> str | None:
    lines = text.strip().split("\n")
    for line in lines:
        date_kw = bool(re.search(r"(?:datum|date|vom|zeit)", line, re.IGNORECASE))
        patterns = [
            (r"(\d{2})[.](\d{2})[.](\d{4})", "dmy4"),
            (r"(\d{2})[.](\d{2})[.](\d{2})\b(?!\d)", "dmy2"),
            (r"(\d{4})[-](\d{2})[-](\d{2})", "ymd"),
            (r"(\d{2})[-](\d{2})[-](\d{4})", "dmy4_dash"),
            (r"(\d{2})/(\d{2})/(\d{4})", "dmy4_slash"),
        ]
        for pattern, fmt in patterns:
            match = re.search(pattern, line)
            if match and (date_kw or fmt != "dmy2"):
                try:
                    if fmt in ("dmy4", "dmy4_dash", "dmy4_slash", "dmy2"):
                        parsed = datetime(int(match.group(3)) if fmt != "dmy2" else 2000 + int(match.group(3)),
                                          int(match.group(2)), int(match.group(1)))
                    else:
                        parsed = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
                    if parsed > datetime(2020, 1, 1) and parsed < datetime(2035, 1, 1):
                        return parsed.date().isoformat()
                except ValueError:
                    continue

    for pattern, fmt in [
        (r"(\d{2})[.](\d{2})[.](\d{4})", "dmy4"),
        (r"(\d{4})[-](\d{2})[-](\d{2})", "ymd"),
        (r"(\d{2})[.](\d{2})[.](\d{2})\b(?!\d)", "dmy2"),
        (r"(\d{2})/(\d{2})/(\d{4})", "dmy4_slash"),
    ]:
        match = re.search(pattern, text)
        if match:
            try:
                if fmt in ("dmy4", "dmy4_slash", "dmy2"):
                    parsed = datetime(
                        int(match.group(3)) if fmt != "dmy2" else 2000 + int(match.group(3)),
                        int(match.group(2)), int(match.group(1))
                    )
                else:
                    parsed = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
                if parsed > datetime(2020, 1, 1) and parsed < datetime(2035, 1, 1):
                    return parsed.date().isoformat()
            except ValueError:
                continue
    return None


def _match_transaction(store_name: str | None, total_amount: float | None, receipt_date: str | None) -> int | None:
    from finance_server.db.transactions import fetch_transactions

    if total_amount is None and receipt_date is None:
        return None

    transactions = fetch_transactions(days=14)
    candidates = []

    for tx in transactions:
        score = 0
        if total_amount is not None:
            if abs(abs(tx["amount"]) - total_amount) < 0.02:
                score += 2

        if receipt_date:
            tx_date = tx.get("date") or tx.get("entry_date")
            if tx_date and tx_date == receipt_date:
                score += 2
            elif tx_date and tx_date[:7] == receipt_date[:7]:
                score += 1

        if store_name and tx.get("applicant_name"):
            if store_name.lower() in tx["applicant_name"].lower():
                score += 3
            elif any(w in tx["applicant_name"].lower() for w in store_name.lower().split()[:2]):
                score += 1

        if score >= 2:
            candidates.append((score, tx["id"]))

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1] if candidates else None


class ReceiptService:
    _reader: Any = None

    @classmethod
    def _get_reader(cls) -> Any:
        if cls._reader is None:
            import easyocr
            import torch
            gpu = torch.backends.mps.is_available() if hasattr(torch.backends, "mps") else False
            cls._reader = easyocr.Reader(["de", "en"], gpu=gpu)
        return cls._reader

    def process_receipt(self, umsatz_id: int, image_path: str, image_filename: str) -> dict[str, Any]:
        reader = self._get_reader()
        results = reader.readtext(image_path)

        buckets: dict[int, list[tuple[float, str, float]]] = {}
        for bbox, text, conf in results:
            top_y = int(min(p[1] for p in bbox))
            left_x = int(min(p[0] for p in bbox))
            bucket = top_y // 6
            buckets.setdefault(bucket, [])
            buckets[bucket].append((left_x, text, conf))

        ocr_lines: list[str] = []
        confidences: list[float] = []
        for bucket in sorted(buckets):
            items = sorted(buckets[bucket], key=lambda x: x[0])
            ocr_lines.append(" ".join(t for _, t, _ in items))
            confidences.extend(c for _, _, c in items)

        ocr_text = "\n".join(ocr_lines)

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        store_name = _extract_store_name(ocr_text)
        total_amount = _extract_total_amount(ocr_text)
        receipt_date = _extract_date(ocr_text)
        line_items = _extract_line_items(ocr_text)

        extracted_data = {
            "raw_text": ocr_text,
            "items": line_items,
            "parsed": {
                "store_name": store_name,
                "total_amount": total_amount,
                "receipt_date": receipt_date,
            },
        }

        receipt = {
            "umsatz_id": umsatz_id,
            "image_filename": image_filename,
            "image_path": image_path,
            "extracted_data": extracted_data,
            "store_name": store_name,
            "total_amount": total_amount,
            "receipt_date": receipt_date,
            "confidence": round(avg_confidence, 4),
        }

        receipt_id = db_insert_receipt(receipt)
        receipt["id"] = receipt_id

        logger.info(
            "EasyOCR processed for umsatz_id=%s: store=%s amount=%s date=%s confidence=%s",
            umsatz_id, store_name, total_amount, receipt_date, round(avg_confidence, 2),
        )

        return receipt

    def set_splits_from_items(self, receipt_id: int) -> list[dict[str, Any]]:
        from finance_server.db.transactions import update_transaction_splits

        receipt = self.get_receipt(receipt_id)
        if not receipt:
            raise ValueError("Beleg nicht gefunden")

        items = (receipt.get("extracted_data") or {}).get("items", [])
        if not items:
            raise ValueError("Keine Artikel auf diesem Beleg gefunden")

        total_price = sum(item["price"] for item in items)
        transaction_amount = abs(
            receipt.get("total_amount") or total_price or 0
        )

        if abs(total_price - transaction_amount) > 0.02:
            items.append({"name": "Differenz", "price": round(transaction_amount - total_price, 2)})

        sign = -1 if total_price > 0 else 1
        splits = [
            {
                "name": item.get("name"),
                "betrag": round(item["price"] * sign, 2),
                "kategorieId": None,
            }
            for item in items
        ]
        update_transaction_splits(receipt["umsatz_id"], splits)
        return splits

    def get_receipts_for_transaction(self, umsatz_id: int) -> list[dict[str, Any]]:
        return db_fetch_receipts_for_transaction(umsatz_id)

    def get_receipt(self, receipt_id: int) -> dict[str, Any] | None:
        return db_fetch_receipt(receipt_id)

    def delete_receipt(self, receipt_id: int) -> bool:
        record = self.get_receipt(receipt_id)
        if record:
            img_path = record.get("image_path")
            if img_path:
                try:
                    Path(img_path).unlink(missing_ok=True)
                except OSError:
                    pass
        return db_delete_receipt(receipt_id)

    def delete_receipts_for_transaction(self, umsatz_id: int) -> int:
        receipts = self.get_receipts_for_transaction(umsatz_id)
        for r in receipts:
            img_path = r.get("image_path")
            if img_path:
                try:
                    Path(img_path).unlink(missing_ok=True)
                except OSError:
                    pass
        return db_delete_receipts_for_transaction(umsatz_id)
