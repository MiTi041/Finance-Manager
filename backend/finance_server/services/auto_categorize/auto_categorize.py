"""
auto_categorize.py – TF-IDF-basierter Kategorisierungs-Vorschlag für Banktransaktionen.

Funktionsprinzip:
  1. Alle bereits kategorisierten Transaktionen dienen als Trainings-Datensatz.
  2. Für jede unkategorisierte Transaktion wird per Kosinus-Ähnlichkeit (TF-IDF)
     die ähnlichste Trainings-Transaktion gesucht.
  3. Überschreitet die Ähnlichkeit den SIMILARITY_THRESHOLD, wird die Kategorie
     der Trainings-Transaktion als Vorschlag übernommen.

Caching-Strategie:
  - Vectorizer + Train-Vektoren werden gecacht und nur neu gebaut, wenn sich
    die kategorisierten Transaktionen geändert haben (SHA-256 über id:kategorie).
  - Die Vorhersagen (predictions) werden erst invalidiert, wenn sich auch die
    unkategorisierten Transaktionen geändert haben (separater Hash).
  - Ein threading.Lock schützt beide Caches vor Race Conditions.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from typing import TYPE_CHECKING, Any
import re

if TYPE_CHECKING:
    from sklearn.feature_extraction.text import TfidfVectorizer

import numpy as np
from scipy.sparse import spmatrix
from finance_server.db import get_connection, update_transaction_category

from finance_server.services.auto_categorize._tfidf import (
    _create_vectorizer,
    _find_best_match,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Globaler Cache – wird von build_predictions() verwaltet.
# _model_cache: enthält Vectorizer und vorberechnete Train-Vektoren.
# _pred_cache:  enthält die fertigen Vorschlagslisten.
# _cache_lock:  schützt beide Caches bei nebenläufigen Requests.
# ──────────────────────────────────────────────────────────────────────────────
_model_cache: dict[str, Any] | None = None   # {"hash": str, "vectorizer": ..., "vectors": ..., "labels": ...}
_pred_cache:  dict[str, Any] | None = None   # {"hash": str, "predictions": list}
_cache_lock = threading.Lock()

# ──────────────────────────────────────────────────────────────────────────────
# Regex-Muster, die aus dem Freitext entfernt werden, bevor TF-IDF ansetzt.
# Ziel: Transaktionsnummern, Zeitstempel und andere rauschende Tokens tilgen,
# damit der Vektorraum nur semantisch relevante Terme enthält.
# ──────────────────────────────────────────────────────────────────────────────
NOISE_PATTERNS = [
    r"\b\d{10,}\b",                     # lange Ziffernfolgen (z. B. Referenznummern)
    r"\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}\b",  # ISO-Datetime
    r"\bdatum\s+\d+\.\d+\.\d+\b",      # "Datum 01.01.2024"
    r"\b\d+\.\d+\s*uhr\b",             # "12.30 Uhr"
    r"\bdebitk\.\d+\b",                # Debitkarten-Kennzahl
    r"\b\d{4}-\d{2}\b",                # Monatscodes wie "2024-03"
]

# ──────────────────────────────────────────────────────────────────────────────
# Text-Vorverarbeitung
# ──────────────────────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    """Normalisiert einen Rohtext für die TF-IDF-Verarbeitung.

    Schritte:
      1. Kleinschreibung
      2. Rausch-Pattern entfernen (Nummern, Daten, …)
      3. Alle Sonderzeichen → Leerzeichen (nur \\w und Leerzeichen bleiben)
      4. Einzelne Ziffern entfernen (Reste aus Schritt 2)
      5. Mehrfach-Leerzeichen normalisieren
    """
    text = text.lower()

    for pattern in NOISE_PATTERNS:
        text = re.sub(pattern, " ", text)

    # Interpunktion und Sonderzeichen entfernen; \\w umfasst [a-z0-9_] + Umlaute
    text = re.sub(r"[^\w\s]", " ", text)

    # Einzelne Ziffern (z. B. Buchungstag "3") sind kein Informationsträger
    text = re.sub(r"\b\d+\b", " ", text)

    # Komprimiere Leerzeichen zu einem einzigen
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def _combine_text(row: dict[str, Any]) -> str:
    """Fasst mehrere Felder einer Transaktion zu einem einzigen Text zusammen.

    Warum Feld-Prefixes (z. B. 'purpose_amazon')? 
    TF-IDF behandelt jeden Token unabhängig. Durch den Prefix wird z. B.
    'amazon' im Verwendungszweck ('purpose_amazon') von 'amazon' im
    Auftraggeber-Feld ('applicant_amazon') unterschieden. Das verbessert die
    Trennschärfe bei Transaktionen, bei denen derselbe Begriff in
    unterschiedlichen Feldern verschiedene Bedeutungen hat.
    """
    fields = {
        "purpose":    row.get("purpose") or "",
        "applicant":  row.get("applicant_name") or "",
        "deviate":    row.get("deviate_applicant") or "",
        "recipient":  row.get("recipient_name") or "",
        "posting":    row.get("posting_text") or "",
        "additional": row.get("additional_purpose") or "",
        "owner":      row.get("zahlungspartner_name") or "",
    }

    tokens: list[str] = []
    for prefix, value in fields.items():
        cleaned = clean_text(value)
        if cleaned:
            # Prefix + Unterstrich bleibt ein zusammenhängender Token für TF-IDF
            tokens.append(f"{prefix}_{cleaned}")

    return " ".join(tokens)


# ──────────────────────────────────────────────────────────────────────────────
# Datenbank-Hilfsfunktionen
# ──────────────────────────────────────────────────────────────────────────────

def _fetch_all_transactions() -> list[dict[str, Any]]:
    """Lädt alle Transaktionen inkl. Zahlungspartner-Name (JOIN über IBAN).

    Sortierung: neueste Buchung zuerst, damit bei gleicher Ähnlichkeit
    aktuellere Trainingsdaten bevorzugt werden.
    """
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT u.*, k.name AS zahlungspartner_name
            FROM umsaetze u
            LEFT JOIN ibans i ON u.applicant_iban = i.iban
            LEFT JOIN zahlungspartner k ON k.id = i.f_zahlungspartner_id
            ORDER BY COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10)) DESC, u.id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def _fetch_categorized_hash() -> str:
    """Berechnet einen SHA-256 über alle kategorisierten Transaktionen.

    Ändert sich dieser Hash, muss der Vectorizer neu trainiert werden,
    weil neue Trainingsbeispiele hinzugekommen sind.
    """
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, kategorie FROM umsaetze WHERE kategorie IS NOT NULL ORDER BY id"
        ).fetchall()
    if not rows:
        return ""
    data = "|".join(f"{r['id']}:{r['kategorie']}" for r in rows)
    return hashlib.sha256(data.encode()).hexdigest()


def _fetch_uncategorized_hash() -> str:
    """Berechnet einen SHA-256 über alle noch nicht kategorisierten Transaktionen.

    Ändert sich dieser Hash (neue Transaktionen importiert), muss die
    Vorhersageliste neu gebaut werden – aber nicht zwingend der Vectorizer.
    """
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id FROM umsaetze WHERE kategorie IS NULL ORDER BY id"
        ).fetchall()
    if not rows:
        return ""
    data = "|".join(str(r["id"]) for r in rows)
    return hashlib.sha256(data.encode()).hexdigest()


# ──────────────────────────────────────────────────────────────────────────────
# Modell-Training
# ──────────────────────────────────────────────────────────────────────────────

def _build_model(
    categorized: list[dict[str, Any]],
) -> dict[str, Any]:
    """Trainiert den TF-IDF-Vectorizer auf den kategorisierten Transaktionen.

    Gibt ein Dict zurück mit:
      - vectorizer:    trainiertes TfidfVectorizer-Objekt
      - train_vectors: sparse Matrix (n_samples × n_features)
      - labels_arr:    numpy-Array der Kategorie-IDs (int)

    Leere Texte werden aus dem Trainingssatz entfernt, damit TF-IDF keine
    Nullvektoren erhält.
    """
    raw_texts  = [_combine_text(t) for t in categorized]
    raw_labels = [t["kategorie"] for t in categorized]

    # Paare mit leerem Text herausfiltern (würden Nullvektoren erzeugen)
    valid_pairs = [(txt, lbl) for txt, lbl in zip(raw_texts, raw_labels) if txt.strip()]
    if not valid_pairs:
        return {}

    train_texts, train_labels = map(list, zip(*valid_pairs))

    labels_arr = np.array(train_labels, dtype=int)

    logger.info("Modell-Training: %d Beispiele", len(train_labels))

    vectorizer = _create_vectorizer(min_df=1)
    train_vectors = vectorizer.fit_transform(train_texts)

    return {
        "vectorizer":    vectorizer,
        "train_vectors": train_vectors,
        "labels_arr":    labels_arr,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Vorhersage
# ──────────────────────────────────────────────────────────────────────────────

def _compute_predictions(
    uncategorized: list[dict[str, Any]],
    model: dict[str, Any],
) -> list[dict[str, Any]]:
    """Berechnet Kategorie-Vorschläge für alle unkategorisierten Transaktionen.

    Ablauf pro Transaktion:
      1. Text kombinieren + in TF-IDF-Raum transformieren (Batch über alle
         unkategorisierten Transaktionen gleichzeitig – deutlich schneller als
         einzelne transform()-Aufrufe in einer Schleife).
      2. Kosinus-Ähnlichkeit zur gesamten Trainingsmenge berechnen.
      3. Bestes Match: wenn Ähnlichkeit ≥ SIMILARITY_THRESHOLD, Vorschlag erzeugen.
    """
    vectorizer:    TfidfVectorizer = model["vectorizer"]
    train_vectors: spmatrix        = model["train_vectors"]
    labels_arr:    np.ndarray      = model["labels_arr"]

    # Texte für alle unkategorisierten Transaktionen vorbereiten
    texts = [_combine_text(tx) for tx in uncategorized]

    # Leere Texte merken – sie bekommen keinen Vorschlag
    non_empty_mask = [bool(t.strip()) for t in texts]

    if not any(non_empty_mask):
        return []

    # Alle nicht-leeren Texte in einem einzigen transform()-Aufruf vektorisieren
    # (statt n einzelner Aufrufe in der Schleife → erheblich schneller bei vielen Tx)
    non_empty_indices = [i for i, ok in enumerate(non_empty_mask) if ok]
    non_empty_texts   = [texts[i] for i in non_empty_indices]
    tx_vectors        = vectorizer.transform(non_empty_texts)   # (m × features)

    predictions: list[dict[str, Any]] = []

    for vec_pos, tx_idx in enumerate(non_empty_indices):
        tx = uncategorized[tx_idx]

        result = _find_best_match(tx_vectors[vec_pos], train_vectors)
        if result is None:
            logger.debug(
                "Überspringe tx=%d: keine passenden Trainingsbeispiele",
                tx["id"],
            )
            continue

        original_idx, best_score = result

        logger.debug(
            "tx=%d best_score=%.3f",
            tx["id"], best_score,
        )

        predictions.append({
            "transaction_id":       tx["id"],
            "entry_date":           tx.get("entry_date"),
            "purpose":              (tx.get("purpose") or "")[:120],
            "amount":               tx.get("amount"),
            "applicant_name":       (tx.get("applicant_name") or "")[:80],
            "recipient_name":       (tx.get("recipient_name") or "")[:80],
            "predicted_category_id": int(labels_arr[original_idx]),
            "similarity":           round(best_score, 3),
        })

    logger.info(
        "Auto-categorize: %d Vorschläge für %d unkategorisierte Transaktionen",
        len(predictions), len(uncategorized),
    )
    return predictions


# ──────────────────────────────────────────────────────────────────────────────
# Öffentliche API
# ──────────────────────────────────────────────────────────────────────────────

def build_predictions() -> list[dict[str, Any]]:
    """Gibt alle aktuellen Kategorie-Vorschläge zurück (mit zwei Caching-Ebenen).

    Cache-Ebene 1 – Modell (Vectorizer + Train-Vektoren):
      Wird nur neu gebaut, wenn sich der Hash der kategorisierten Transaktionen
      geändert hat (neue Transaktionen kategorisiert oder Kategorie geändert).

    Cache-Ebene 2 – Vorhersagen:
      Werden nur neu berechnet, wenn sich der Hash der *unkategorisierten*
      Transaktionen geändert hat (neue Imports) – oder wenn Level 1 neu gebaut
      wurde (veränderte Trainingsgrundlage).

    Der threading.Lock stellt sicher, dass parallele Requests nicht gleichzeitig
    den teuren Rebuild anstoßen.
    """
    global _model_cache, _pred_cache

    with _cache_lock:
        categorized_hash   = _fetch_categorized_hash()
        uncategorized_hash = _fetch_uncategorized_hash()

        # ── Level-1-Cache: Modell prüfen ──────────────────────────────────────
        model_stale = (
            _model_cache is None
            or _model_cache.get("hash") != categorized_hash
        )

        if model_stale:
            logger.info("Modell-Cache veraltet – trainiere neu (hash=%s)", categorized_hash[:8])
            all_tx      = _fetch_all_transactions()
            categorized = [t for t in all_tx if t.get("kategorie") is not None]
            model       = _build_model(categorized)

            if not model:
                # Keine kategorisierten Transaktionen vorhanden → kein Modell
                return []

            _model_cache = {"hash": categorized_hash, **model}
            # Vorhersage-Cache ist nach Modell-Rebuild zwangsläufig veraltet
            _pred_cache = None

        # ── Level-2-Cache: Vorhersagen prüfen ────────────────────────────────
        pred_stale = (
            _pred_cache is None
            or _pred_cache.get("hash") != uncategorized_hash
            or model_stale  # Modell hat sich geändert → Vorhersagen neu berechnen
        )

        if pred_stale:
            logger.info("Vorhersage-Cache veraltet – berechne neu (hash=%s)", uncategorized_hash[:8])
            all_tx        = _fetch_all_transactions()
            uncategorized = [t for t in all_tx if t.get("kategorie") is None and t.get("id")]
            predictions   = _compute_predictions(uncategorized, _model_cache)  # type: ignore[arg-type]
            _pred_cache   = {"hash": uncategorized_hash, "predictions": predictions}

        return _pred_cache["predictions"]  # type: ignore[index]


def apply_prediction(transaction_id: int, category_id: int | None) -> None:
    """Übernimmt einen Kategorie-Vorschlag und schreibt ihn in die Datenbank.

    Nach dem Schreiben ist der nächste Aufruf von build_predictions() ein
    Cache-Miss auf Level 1 (neues Trainingsbeispiel) – das Modell wird
    automatisch aktualisiert.
    """
    update_transaction_category(transaction_id, category_id)