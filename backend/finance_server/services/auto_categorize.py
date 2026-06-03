from __future__ import annotations

import hashlib
import logging
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from finance_server.db import get_connection, update_transaction_category

logger = logging.getLogger(__name__)

_cached_predictions: list[dict[str, Any]] | None = None
_cached_training_hash: str | None = None

GERMAN_STOP_WORDS = frozenset({
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen",
    "einem", "eines", "mit", "von", "fuer", "f\u00fcr", "an", "auf", "bei",
    "aus", "nach", "zu", "und", "oder", "aber", "als", "um", "durch",
    "gegen", "ohne", "bis", "sich", "ihr", "ihre", "nicht", "sowie",
    "ueber", "\u00fcber", "vor", "zum", "zur", "www", "de", "com",
    "gmbh", "ug", "haftungsbeschraenkt", "haftungsbeschr\u00e4nkt",
    "ev", "se", "ag", "kg", "co", "limited", "ltd",
    "inc", "corporation", "corp", "sitz", "nr", "str", "strasse",
    "stra\u00dfe", "iban", "bic", "gvg", "sep",
})

SIMILARITY_THRESHOLD = 0.25


def _combine_text(row: dict[str, Any]) -> str:
    parts = [
        row.get("purpose") or "",
        row.get("applicant_name") or "",
        row.get("deviate_applicant") or "",
        row.get("recipient_name") or "",
        row.get("posting_text") or "",
        row.get("additional_purpose") or "",
        row.get("kontoinhaber_name") or "",
    ]
    return " ".join(p.lower().strip() for p in parts if isinstance(p, str) and p.strip())


def _fetch_all_transactions() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT u.*, k.name AS kontoinhaber_name
            FROM umsaetze u
            LEFT JOIN ibans i ON u.applicant_iban = i.iban
            LEFT JOIN kontoinhaber k ON k.id = i.f_kontoinhaber_id
            ORDER BY COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10)) DESC, u.id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def _fetch_categorized_hash() -> str:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, kategorie FROM umsaetze WHERE kategorie IS NOT NULL ORDER BY id"
        ).fetchall()
    if not rows:
        return ""
    data = "|".join(f"{r['id']}:{r['kategorie']}" for r in rows)
    return hashlib.sha256(data.encode()).hexdigest()


def _compute_predictions() -> list[dict[str, Any]]:
    all_tx = _fetch_all_transactions()
    categorized = [t for t in all_tx if t.get("kategorie") is not None]
    uncategorized = [t for t in all_tx if t.get("kategorie") is None and t.get("id")]

    if not categorized or not uncategorized:
        return []

    train_texts = [_combine_text(t) for t in categorized]
    train_labels: list[int] = [t["kategorie"] for t in categorized]

    valid = [(txt, lbl) for txt, lbl in zip(train_texts, train_labels) if txt.strip()]
    if not valid:
        return []

    train_texts, train_labels = map(list, zip(*valid))  # type: ignore[arg-type]

    vectorizer = TfidfVectorizer(
        stop_words=list(GERMAN_STOP_WORDS),
        max_features=2000,
        ngram_range=(1, 2),
        min_df=1,
        analyzer="word",
    )
    train_vectors = vectorizer.fit_transform(train_texts)
    train_labels_arr = np.array(train_labels)

    predictions: list[dict[str, Any]] = []

    for tx in uncategorized:
        text = _combine_text(tx)
        if not text.strip():
            continue

        tx_vector = vectorizer.transform([text])
        similarities = cosine_similarity(tx_vector, train_vectors).flatten()
        best_idx = int(similarities.argmax())
        best_score = float(similarities[best_idx])

        if best_score >= SIMILARITY_THRESHOLD:
            predictions.append({
                "transaction_id": tx["id"],
                "entry_date": tx.get("entry_date"),
                "purpose": (tx.get("purpose") or "")[:120],
                "amount": tx.get("amount"),
                "applicant_name": (tx.get("applicant_name") or "")[:80],
                "recipient_name": (tx.get("recipient_name") or "")[:80],
                "predicted_category_id": int(train_labels_arr[best_idx]),
                "similarity": round(best_score, 3),
            })

    logger.info(
        "Auto-categorize: %d predictions built from %d uncategorized",
        len(predictions),
        len(uncategorized),
    )
    return predictions


def build_predictions() -> list[dict[str, Any]]:
    global _cached_predictions, _cached_training_hash

    current_hash = _fetch_categorized_hash()

    if _cached_predictions is not None and _cached_training_hash == current_hash:
        return _cached_predictions

    _cached_training_hash = current_hash
    _cached_predictions = _compute_predictions()
    return _cached_predictions


def apply_prediction(transaction_id: int, category_id: int | None) -> None:
    update_transaction_category(transaction_id, category_id)
