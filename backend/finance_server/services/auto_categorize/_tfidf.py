from __future__ import annotations

from scipy.sparse import spmatrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Stoppwörter (Deutsch + juristische Formen), die TF-IDF ignorieren soll.
# GmbH, AG, KG usw. sind in fast jedem Firmennamen – sie tragen nichts zur
# Unterscheidung bei und werden deshalb unterdrückt.
GERMAN_STOP_WORDS = frozenset({
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen",
    "einem", "eines", "mit", "von", "fuer", "für", "an", "auf", "bei",
    "aus", "nach", "zu", "und", "oder", "aber", "als", "um", "durch",
    "gegen", "ohne", "bis", "sich", "ihr", "ihre", "nicht", "sowie",
    "ueber", "über", "vor", "zum", "zur", "www", "de", "com",
    "gmbh", "ug", "haftungsbeschraenkt", "haftungsbeschränkt",
    "ev", "se", "ag", "kg", "co", "limited", "ltd",
    "inc", "corporation", "corp", "sitz", "nr", "str", "strasse",
    "straße", "iban", "bic", "gvg", "sep",
})

SIMILARITY_THRESHOLD = 0.45


def _create_vectorizer(*, min_df: int = 1) -> TfidfVectorizer:
    return TfidfVectorizer(
        stop_words=list(GERMAN_STOP_WORDS),
        max_features=5000,
        ngram_range=(1, 3),
        min_df=min_df,
        sublinear_tf=True,
    )


def _find_best_match(
    tx_vector: spmatrix,
    train_vectors: spmatrix,
    threshold: float = SIMILARITY_THRESHOLD,
) -> tuple[int, float] | None:
    if train_vectors.shape[0] == 0:
        return None

    similarities = cosine_similarity(tx_vector, train_vectors).flatten()

    best_idx = int(similarities.argmax())
    best_score = float(similarities[best_idx])

    if best_score < threshold:
        return None

    return best_idx, best_score
