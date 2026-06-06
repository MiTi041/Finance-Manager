"""
base_categorize.py – Kalt-Start-Kategorisierung und kombinierte Vorhersagen.

Problem:
  Das eigene TF-IDF-Modell (auto_categorize.py) braucht ausreichend kategorisierte
  Transaktionen als Trainingsbasis. Bei wenigen oder keinen Daten liefert es
  keine oder schwache Vorschläge.

Lösung – drei Stufen, die in build_combined_predictions() orchestriert werden:

  Stufe 1 – Eigenes TF-IDF-Modell (auto_categorize.build_predictions):
    Nutzt die eigenen kategorisierten Transaktionen. Zuverlässig sobald
    ausreichend Beispiele vorhanden.

  Stufe 2 – Regelbasierter Fallback (predict_rules):
    Hardcodierte Keyword-Listen decken den häufigsten Alltag ab
    (REWE → Lebensmittel, Netflix → Streaming, …). Keine Daten nötig,
    sofort verfügbar, deterministisch.

  Stufe 3 – Globales TF-IDF-Basis-Modell (predict_base):
    Verwendet alle kategorisierten Transaktionen aus der Datenbank.
    Da Kategorien global sind (nicht pro Nutzer), werden Label-Namen
    direkt aufgelöst. Das Basis-Modell lernt automatisch dazu.

Reihenfolge in build_combined_predictions():
  ┌──────────────────────────────────────────────────────────────┐
  │  1. Eigenes Modell (TF-IDF auf eigenen Daten)               │
  │     → für jede Transaktion, die einen Treffer hat            │
  │                                                              │
  │  2. Für Transaktionen OHNE eigenen Treffer:                  │
  │     → Keyword-Regeln (predict_rules)                         │
  │     → falls kein Treffer: Basis-Modell (predict_base)        │
  │                                                              │
  │  3. Ergebnisse werden zusammengeführt und zurückgegeben      │
  └──────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import hashlib
import logging
import os
import pickle
import re
import threading
import time
from typing import Any

import numpy as np

from finance_server.db import get_connection
from finance_server.db.paths import get_db_path
from finance_server.services.auto_categorize._tfidf import (
    _create_vectorizer,
    _find_best_match,
    SIMILARITY_THRESHOLD,
)

from finance_server.services.auto_categorize.auto_categorize import (
    clean_text,
    _combine_text,
)

from finance_server.services.auto_categorize.auto_categorize import (
    build_predictions as build_own_predictions,
    _fetch_all_transactions,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Konfiguration
# ──────────────────────────────────────────────────────────────────────────────

# Nutzer mit weniger als MIN_OWN_SAMPLES eigenen Trainingsdaten bekommen
# immer Stufe 2 + 3 als Ergänzung angeboten – unabhängig vom eigenen Modell.
MIN_OWN_SAMPLES = 20

# TTL für den globalen Basis-Modell-Cache. Nach dieser Zeit wird das Modell
# neu gebaut, um Kategorisierungen anderer Nutzer einzubeziehen.
_BASE_MODEL_TTL_SECONDS = 3600  # 1 Stunde

# ──────────────────────────────────────────────────────────────────────────────
# Cache + Persistenz für das globale Basis-Modell
# ──────────────────────────────────────────────────────────────────────────────

_base_model_cache: dict[str, Any] | None = None
_base_model_lock = threading.Lock()

def _base_model_path() -> str:
    """Pfad für die Pickle-Datei des Basis-Modells (neben der DB)."""
    db_path = get_db_path()
    return str(db_path.parent / "base_model.pkl")


def _save_base_model(model: dict[str, Any]) -> None:
    """Serialisiert das Modell als Pickle auf die Platte.

    sklearn-Modelle (TfidfVectorizer) sind pickle-bar. Die sparse train_vectors
    (scipy.sparse) ebenfalls. So kann das Modell beim nächsten App-Start
    geladen werden, ohne neu trainieren zu müssen.

    Die 'built_at'-Metrik wird vor dem Speichern auf 0 gesetzt, damit der
    TTL-Check beim Laden immer einen Rebuild erzwingt (der Pickle-Wert wäre
    sonst gegenüber dem TTL-Check veraltet).
    """
    path = _base_model_path()
    try:
        with open(path, "wb") as f:
            pickle.dump(model, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Basis-Modell gespeichert: %s", path)
    except Exception:
        logger.exception("Fehler beim Speichern des Basis-Modells nach %s", path)


def _load_base_model() -> dict[str, Any] | None:
    """Lädt das Modell von der Platte, falls vorhanden."""
    path = _base_model_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            model = pickle.load(f)
        logger.info("Basis-Modell geladen: %s", path)
        return model
    except Exception:
        logger.exception("Fehler beim Laden des Basis-Modells von %s", path)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# STUFE 2 – Regelbasierter Keyword-Fallback
# ══════════════════════════════════════════════════════════════════════════════

# Jede Regel ist ein Tupel (regex-Pattern, normalisierter Kategoriename, Typ).
# Die Patterns werden case-insensitiv auf dem kombinierten Transaktionstext
# (Verwendungszweck + Auftraggeber + Empfänger) geprüft.
#
# Wichtig: Reihenfolge ist signifikant – spezifischere Regeln stehen oben,
# allgemeinere unten. Beim ersten Match wird abgebrochen.
#
# Normalisierter Kategoriename = Kleinschreibung, wie er auch im Basis-Modell
# verwendet wird. Auflösung auf die nutzerspezifische ID erfolgt in
# _resolve_category_id().

KEYWORD_RULES: list[tuple[str, str, str]] = [
    # ── Lebensmittel & Drogerie ───────────────────────────────────────────────
    (r"\b(rewe|edeka|aldi|lidl|penny|netto|kaufland|norma|tegut|real|diska"
     r"|nahkauf|wasgau|famila|globus|hit\s+markt|v\s*markt|marktkauf"
     r"|denns|basic\s*bio|alnatura|dm[\s\-]drogerie|rossmann|mueller"
     r"|budni|ihr\s+platz)\b",
     "lebensmittel", "Ausgabe"),

    # ── Restaurants & Lieferdienste ───────────────────────────────────────────
    (r"\b(mcdonalds|mc\s*donald|burger\s*king|kfc|subway|dominos|domino"
     r"|pizza\s*hut|lieferando|just\s*eat|uber\s*eats|wolt|deliveroo"
     r"|nordsee|backwerk|baeckerei|bäckerei|coffeeshop|starbucks"
     r"|dunkin|cafe\s*nero|vapiano|hans\s+im\s+glück)\b",
     "restaurant & lieferdienste", "Ausgabe"),

    # ── Streaming & Medien ────────────────────────────────────────────────────
    (r"\b(netflix|spotify|amazon\s*prime|prime\s*video|disney[\s\+]"
     r"|apple\s*tv|hbo|paramount|dazn|sky\s*ticket|magenta\s*tv"
     r"|joyn|wow\s*streaming|youtube\s*premium|audible|kindle"
     r"|apple\s*music|tidal|deezer)\b",
     "streaming & medien", "Ausgabe"),

    # ── Online-Shopping ───────────────────────────────────────────────────────
    (r"\b(amazon(?!\s*prime|\s*web|\s*aws)[\w\s]*marketplace|amazon\s*eu"
     r"|ebay|zalando|otto[\.\s]|about\s*you|zara|h\s*&\s*m|c\s*&\s*a"
     r"|adidas|nike|puma|uniqlo|asos|shein|temu|wish[\.\s]|etsy)\b",
     "online-shopping", "Ausgabe"),

    # ── Elektronik ────────────────────────────────────────────────────────────
    (r"\b(saturn[\.\s]|media\s*markt|apple\s*store|apple\.com"
     r"|microsoft\s*store|cyberport|notebooksbilliger|mindfactory"
     r"|alternate[\.\s]|conrad[\.\s])\b",
     "elektronik", "Ausgabe"),

    # ── Mobilfunk & Internet ──────────────────────────────────────────────────
    (r"\b(telekom|deutsche\s*telekom|vodafone|o2[\.\s]|1\s*&\s*1|eplus"
     r"|congstar|blau[\.\s]|simyo|freenet|klarmobil|drillisch"
     r"|maingau[\s\-]energie|unitymedia|kabel\s*deutschland)\b",
     "mobilfunk & internet", "Ausgabe"),

    # ── Strom, Gas, Wasser ────────────────────────────────────────────────────
    (r"\b(stadtwerke|e\.on|eon[\.\s]|rwe[\.\s]|vattenfall|enbw|n[\s\-]ergie"
     r"|swm[\.\s]|entega|naturstrom|lichtblick|yello\s*strom"
     r"|gasversorgung|wasserversorgung|abwasser)\b",
     "strom, gas & wasser", "Ausgabe"),

    # ── Miete & Wohnen ────────────────────────────────────────────────────────
    (r"\b(miete|warmmiete|kaltmiete|hausgeld|wohnungsbaugesellschaft"
     r"|hausverwaltung|immobilien\s*gmbh|nebenkosten|betriebskosten"
     r"|wohngeld)\b",
     "miete & wohnen", "Ausgabe"),

    # ── Versicherungen ────────────────────────────────────────────────────────
    (r"\b(allianz|axa[\.\s]|huk[\s\-]coburg|huk24|ergo[\.\s]|generali"
     r"|zurich[\.\s]|signal\s*iduna|debeka|barmer|techniker\s*krankenkasse"
     r"|tk[\.\s]|aok[\.\s]|kkh[\.\s]|dak[\.\s]|ikk[\.\s]|bkk[\.\s]"
     r"|versicherung|beitrag\s*kranken|beitrag\s*haftpflicht)\b",
     "versicherungen", "Ausgabe"),

    # ── Gesundheit & Apotheke ─────────────────────────────────────────────────
    (r"\b(apotheke|DocMorris|shop\s*apotheke|medikament|arztpraxis|zahnarzt"
     r"|physiotherapie|optiker|fielmann|mister\s*spex|synoptik)\b",
     "gesundheit & apotheke", "Ausgabe"),

    # ── Öffentlicher Nahverkehr ───────────────────────────────────────────────
    (r"\b(mvv[\.\s]|hvv[\.\s]|bvg[\.\s]|vgn[\.\s]|rnv[\.\s]|vrs[\.\s]"
     r"|vvs[\.\s]|rheinbahn|kvb[\.\s]|ssb[\.\s]|dvb[\.\s]|üstra"
     r"|db\s*regio|s[\s\-]bahn|u[\s\-]bahn|strassenbahn|monatskarte"
     r"|semesterticket|deutschlandticket)\b",
     "öpnv", "Ausgabe"),

    # ── Bahn & Fernverkehr ────────────────────────────────────────────────────
    (r"\b(deutsche\s*bahn|db[\.\s]fernverkehr|db\s*vertrieb|bahn\.de"
     r"|flixbus|flixtrain|eurolines|ic[\s\-]bus)\b",
     "bahn & fernverkehr", "Ausgabe"),

    # ── Tanken & Auto ─────────────────────────────────────────────────────────
    (r"\b(aral[\.\s]|shell[\.\s]|bp[\.\s]|esso[\.\s]|total[\.\s energies]"
     r"|jet[\.\s]tankstelle|star[\.\s]tankstelle|hem[\.\s]|tankstelle"
     r"|kfz[\s\-]versicherung|kfz[\s\-]steuer|adac[\.\s]|tuev|tüv"
     r"|autowerkstatt|reifenwechsel)\b",
     "auto & tanken", "Ausgabe"),

    # ── Parken & Sharing ─────────────────────────────────────────────────────
    (r"\b(sixt[\.\s]|hertz[\.\s]|europcar|enterprise[\s\-]rent|flinkster"
     r"|stadtteilauto|share\s*now|free\s*now|miles[\.\s]|tier[\.\s]"
     r"|lime[\.\s]|bird[\.\s]|bolt[\.\s]|voi[\.\s]|uber[\.\s]|taxi)\b",
     "mobilität & sharing", "Ausgabe"),

    # ── Flug & Reise ─────────────────────────────────────────────────────────
    (r"\b(lufthansa|easyjet|ryanair|eurowings|condor[\.\s]|tui[\.\s]"
     r"|thomas\s*cook|booking[\.\s]com|airbnb|hotels[\.\s]com|expedia"
     r"|opodo|check24\s*reise|holidaycheck)\b",
     "reise & urlaub", "Ausgabe"),

    # ── Sport & Fitness ───────────────────────────────────────────────────────
    (r"\b(mcfit|fitnessstudio|fitness\s*first|clever\s*fit|john\s*reed"
     r"|urban\s*sports|qualitrain|sports\s*direct|decathlon|intersport"
     r"|sport\s*scheck)\b",
     "sport & fitness", "Ausgabe"),

    # ── Bildung & Weiterbildung ───────────────────────────────────────────────
    (r"\b(udemy|coursera|linkedin\s*learning|skillshare|duolingo"
     r"|babbel[\.\s]|volkshochschule|vhs[\.\s]|schulgeld|studiengebühr"
     r"|seminargebühr|bücher|thalia|weltbild|hugendubel)\b",
     "bildung & weiterbildung", "Ausgabe"),

    # ── Software & Cloud ──────────────────────────────────────────────────────
    (r"\b(adobe[\.\s]|microsoft\s*365|office\s*365|google\s*one"
     r"|google\s*workspace|dropbox[\.\s]|notion[\.\s]|slack[\.\s]"
     r"|github[\.\s]|digitalocean|hetzner|aws[\.\s]|azure[\.\s]"
     r"|netlify|vercel)\b",
     "software & cloud", "Ausgabe"),

    # ── Haushalt & Möbel ─────────────────────────────────────────────────────
    (r"\b(ikea[\.\s]|xxxl[\s\-]|höffner|poco[\.\s]|roller[\.\s]möbel"
     r"|bauhaus[\.\s]|obi[\.\s]|hornbach|hagebaumarkt|toom[\.\s]"
     r"|hellweg|praktiker)\b",
     "haushalt & möbel", "Ausgabe"),

    # ── Kinder & Familie ─────────────────────────────────────────────────────
    (r"\b(toys\s*r\s*us|smyths[\.\s]|mytoys|babymarkt|babywalz"
     r"|windeln[\.\s]|kindergarten|kita[\.\s]|kindertages|hort[\.\s]"
     r"|schulmaterial|schulgebühr)\b",
     "kinder & familie", "Ausgabe"),

    # ── Spenden & Mitgliedschaften ────────────────────────────────────────────
    (r"\b(spende|donate|paypal\s*giving|betterplace|wikipedia"
     r"|mitgliedsbeitrag|vereinsbeitrag|jahresbeitrag|abo[\.\s])\b",
     "spenden & mitgliedschaften", "Ausgabe"),

    # ── Steuer & Behörden ─────────────────────────────────────────────────────
    (r"\b(finanzamt|steuerberater|gerichtskosten|bußgeld|knöllchen"
     r"|kraftfahrzeugsteuer|rundfunkbeitrag|ard[\s\-]zdf|gez[\.\s])\b",
     "steuern & behörden", "Ausgabe"),

    # ── Bankgebühren ──────────────────────────────────────────────────────────
    (r"\b(kontoführung|kontoführungsgebühr|kontogebühr|entgelt[\s\-]konto"
     r"|jahresgebühr[\s\-]karte|kreditkartengebühr|dispozinsen"
     r"|überziehungszinsen|fremdgeldeingang|transaktionsgebühr)\b",
     "bankgebühren", "Ausgabe"),

    # ── ATM / Bargeldabhebung ─────────────────────────────────────────────────
    (r"\b(geldautomat|bargeldabhebung|atm[\.\s]|abhebung|auszahlung\s*automaten?)\b",
     "bargeldabhebung", "Ausgabe"),

    # ────────────────────────────────────────────────────────────────────────
    # EINNAHMEN
    # ────────────────────────────────────────────────────────────────────────

    # ── Gehalt & Lohn ─────────────────────────────────────────────────────────
    (r"\b(gehalt|lohn|vergütung|entgelt|nettolohn|bruttolohn|lohnzahlung"
     r"|gehaltseingang|monatslohn|arbeitsentgelt)\b",
     "gehalt & lohn", "Einnahme"),

    # ── Freiberuflich / Honorar ───────────────────────────────────────────────
    (r"\b(honorar|freelance|rechnung\s*nr|rechnungsbetrag|aufwandsentschädigung"
     r"|beratungshonorar)\b",
     "freiberufliche einnahmen", "Einnahme"),

    # ── Rente & Sozialleistungen ──────────────────────────────────────────────
    (r"\b(rente|pension|kindergeld|elterngeld|arbeitslosengeld|bürgergeld"
     r"|sozialhilfe|wohngeld|bafög|stipendium)\b",
     "rente & sozialleistungen", "Einnahme"),

    # ── Steuerrückerstattung ──────────────────────────────────────────────────
    (r"\b(steuererstattung|steuerrückerstattung|finanzamt\s*erstattung)\b",
     "steuererstattung", "Einnahme"),

    # ── Zinsen & Kapitalerträge ───────────────────────────────────────────────
    (r"\b(zinsgutschrift|zinsen[\s\-]gutschrift|dividende|kapitalertrag"
     r"|ausschüttung|coupon[\s\-]zahlung)\b",
     "zinsen & kapitalerträge", "Einnahme"),

    # ── Mieteinnahmen ─────────────────────────────────────────────────────────
    (r"\b(mieteinnahme|mietzahlung|miete[\s\-]eingang|warmmiete\s*eingang)\b",
     "mieteinnahmen", "Einnahme"),

    # ── Erstattungen & Rückbuchungen ──────────────────────────────────────────
    (r"\b(erstattung|rückerstattung|gutschrift(?!\s*zins)|rückbuchung"
     r"|refund|cashback|payback[\s\-]einlösung)\b",
     "erstattungen", "Einnahme"),
]

# Vorcompilierte Regex-Objekte (case-insensitiv) für schnelle Suche
_COMPILED_RULES: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(pattern, re.IGNORECASE), cat_name, typ)
    for pattern, cat_name, typ in KEYWORD_RULES
]


def _resolve_category_id(
    category_name: str,
    typ: str,
    user_categories: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Löst einen normalisierten Kategorienamen auf eine nutzerspezifische ID auf.

    Strategie (in dieser Reihenfolge):
      1. Exakter Match (case-insensitiv, getrimmt)
      2. Partieller Match: category_name ist Teilstring des Nutzernamens
         (z. B. "lebensmittel" matcht "Lebensmittel & Drogerie")
      3. Kein Match → None (Kategorie existiert beim Nutzer nicht)
    """
    norm = category_name.strip().lower()

    # Exakter Match
    for cat in user_categories:
        if cat["name"].strip().lower() == norm and cat["typ"] == typ:
            return cat

    # Partieller Match
    for cat in user_categories:
        if norm in cat["name"].strip().lower() and cat["typ"] == typ:
            return cat

    return None


# ══════════════════════════════════════════════════════════════════════════════
# STUFE 3 – Globales TF-IDF-Basis-Modell
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_all_categorized_transactions() -> list[dict[str, Any]]:
    """Lädt alle kategorisierten Transaktionen über *alle* Nutzer hinweg.

    Der JOIN auf `kategorien` liefert Name und Typ, da Kategorie-IDs
    zwischen verschiedenen Nutzern nicht vergleichbar sind.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                u.*,
                k_name.name   AS kontoinhaber_name,
                kat.name      AS kategorie_name,
                kat.typ       AS kategorie_typ
            FROM umsaetze u
            JOIN kategorien kat ON kat.id = u.kategorie
            LEFT JOIN ibans i ON u.applicant_iban = i.iban
            LEFT JOIN kontoinhaber k_name ON k_name.id = i.f_kontoinhaber_id
            WHERE u.kategorie IS NOT NULL
            ORDER BY u.id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def _fetch_all_categories() -> list[dict[str, Any]]:
    """Gibt alle globalen Kategorien zurück (id, name, typ).

    Kategorien sind in diesem System global (nicht pro Nutzer), daher
    gibt es keine Einschränkung auf einen bestimmten Kontoinhaber.
    """
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, typ FROM kategorien ORDER BY id",
        ).fetchall()
    return [dict(row) for row in rows]


def _categorized_count() -> int:
    """Zählt alle kategorisierten Transaktionen in der Datenbank."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM umsaetze WHERE kategorie IS NOT NULL",
        ).fetchone()
    return row["cnt"] if row else 0


def _build_base_model() -> dict[str, Any] | None:
    """Trainiert den globalen TF-IDF-Vectorizer auf allen Nutzerdaten.

    Label-Format: "Typ::kategoriename" (alles lowercase), z. B. "Ausgabe::lebensmittel".
    Dadurch sind Labels über Nutzergrenzen hinweg vergleichbar, obwohl die
    Kategorie-IDs sich unterscheiden.

    min_df=2: Terme, die nur in einer einzigen Transaktion vorkommen (z. B.
    einmalige Auftragsnummern), werden ignoriert – sie generalisieren nicht.
    """
    rows = _fetch_all_categorized_transactions()
    if not rows:
        logger.warning("Basis-Modell: keine kategorisierten Transaktionen in der DB.")
        return None

    train_texts:  list[str] = []
    train_labels: list[str] = []

    for row in rows:
        text = _combine_text(row)
        if not text.strip():
            continue
        label = f"{row['kategorie_typ']}::{row['kategorie_name'].strip().lower()}"
        train_texts.append(text)
        train_labels.append(label)

    if not train_texts:
        return None

    vectorizer = _create_vectorizer(min_df=2)
    train_vectors = vectorizer.fit_transform(train_texts)

    logger.info(
        "Basis-Modell trainiert: %d Transaktionen, %d eindeutige Labels",
        len(train_labels),
        len(set(train_labels)),
    )

    return {
        "vectorizer":    vectorizer,
        "train_vectors": train_vectors,
        "labels":        train_labels,
        "built_at":      time.monotonic(),
    }


def _get_base_model() -> dict[str, Any] | None:
    """Gibt das Basis-Modell zurück (disk-gecacht, TTL-gesteuert).

    Ladereihenfolge:
      1. In-Memory-Cache (_base_model_cache) – schnellster Pfad
      2. Pickle-Datei auf Platte – überlebt App-Neustarts
      3. Neu trainieren aus der DB – wenn kein Cache existiert

    Nach dem Training wird das Modell automatisch auf Platte gespeichert,
    damit der nächste App-Start schneller ist.

    Alle _BASE_MODEL_TTL_SECONDS wird ein Rebuild erzwungen, um neue
    Kategorisierungen (auch von anderen Nutzern) einzubeziehen.
    """
    global _base_model_cache

    with _base_model_lock:
        now = time.monotonic()
        if (
            _base_model_cache is not None
            and now - _base_model_cache["built_at"] < _BASE_MODEL_TTL_SECONDS
        ):
            return _base_model_cache

        # Versuche von Platte zu laden (wenn im Cache nichts ist)
        if _base_model_cache is None:
            disk_model = _load_base_model()
            if disk_model is not None:
                _base_model_cache = disk_model
                if now - _base_model_cache["built_at"] < _BASE_MODEL_TTL_SECONDS:
                    return _base_model_cache
                logger.info("Basis-Modell auf Platte gefunden, aber TTL abgelaufen.")

        logger.info("Basis-Modell – baue neu (TTL abgelaufen oder kein Cache).")
        _base_model_cache = _build_base_model()

        if _base_model_cache is not None:
            _save_base_model(_base_model_cache)

        return _base_model_cache


# ══════════════════════════════════════════════════════════════════════════════
# Öffentliche Vorhersage-Funktionen
# ══════════════════════════════════════════════════════════════════════════════

def predict_rules(
    transaction: dict[str, Any],
) -> dict[str, Any] | None:
    """Stufe 2: Regelbasierter Keyword-Match.

    Durchläuft KEYWORD_RULES der Reihe nach und gibt beim ersten Treffer
    den aufgelösten Vorschlag zurück. Kein Treffer → None.

    Der kombinierte Text (Verwendungszweck + Auftraggeber etc.) wird gegen
    die vorcompilierten Regex-Patterns geprüft. Da Patterns spezifisch zu
    allgemein sortiert sind, gewinnt immer die präziseste Regel.

    Kategorien sind global (kein kontoinhaber_id nötig).
    """
    # Texte für die Keyword-Suche zusammenführen (ohne Feld-Prefixes, da
    # die Regex-Patterns auf natürlichsprachigen Text ausgelegt sind)
    raw_text = " ".join(filter(None, [
        transaction.get("purpose") or "",
        transaction.get("applicant_name") or "",
        transaction.get("recipient_name") or "",
        transaction.get("posting_text") or "",
        transaction.get("additional_purpose") or "",
    ]))
    search_text = clean_text(raw_text)

    if not search_text.strip():
        return None

    amount = transaction.get("amount") or 0
    expected_typ = "Einnahme" if amount > 0 else "Ausgabe"

    all_categories = _fetch_all_categories()

    for pattern, cat_name, typ in _COMPILED_RULES:
        if typ != expected_typ:
            continue

        if pattern.search(search_text):
            matched_cat = _resolve_category_id(cat_name, typ, all_categories)

            if matched_cat is None:
                logger.debug(
                    "Regel-Match '%s' für tx=%s, aber Kategorie nicht vorhanden.",
                    cat_name, transaction.get("id"),
                )
                continue

            logger.debug(
                "Regel-Match: tx=%s → '%s' (Muster: %s)",
                transaction.get("id"), matched_cat["name"], pattern.pattern[:60],
            )
            return {
                "predicted_category_id":   matched_cat["id"],
                "predicted_category_name": matched_cat["name"],
                "similarity":              1.0,
                "source":                  "rules",
            }

    return None


def predict_base(
    transaction: dict[str, Any],
) -> dict[str, Any] | None:
    """Stufe 3: Globales TF-IDF-Basis-Modell.

    Transformiert den Transaktionstext in den TF-IDF-Vektorraum des globalen
    Modells und sucht das ähnlichste Trainingsbeispiel (cosine similarity).
    Nur Trainingsbeispiele desselben Typs (Einnahme/Ausgabe) werden verglichen.

    Rückgabe: Vorschlag mit Kategorie-ID, oder None wenn
    Ähnlichkeit < SIMILARITY_THRESHOLD oder keine Auflösung möglich.

    Kategorien sind global – der Label (z. B. "Ausgabe::lebensmittel") wird
    direkt via _resolve_category_id() auf eine existierende Kategorie-ID
    gemappt.
    """
    model = _get_base_model()
    if model is None:
        return None

    text = _combine_text(transaction)
    if not text.strip():
        return None

    amount = transaction.get("amount") or 0
    expected_typ = "Einnahme" if amount > 0 else "Ausgabe"

    type_mask = np.array(
        [lbl.startswith(expected_typ) for lbl in model["labels"]],
        dtype=bool,
    )

    if not np.any(type_mask):
        return None

    tx_vector = model["vectorizer"].transform([text])
    filtered_vectors = model["train_vectors"][type_mask]
    filtered_labels  = [lbl for lbl, keep in zip(model["labels"], type_mask) if keep]

    result = _find_best_match(tx_vector, filtered_vectors)
    if result is None:
        return None

    original_idx, best_score = result
    best_label = filtered_labels[original_idx]
    category_name = best_label.split("::", 1)[1]

    all_categories = _fetch_all_categories()
    matched_cat = _resolve_category_id(category_name, expected_typ, all_categories)

    if matched_cat is None:
        logger.debug(
            "Basis-Modell: Kategorie '%s' nicht auflösbar.",
            category_name,
        )
        return None

    return {
        "predicted_category_id":   matched_cat["id"],
        "predicted_category_name": matched_cat["name"],
        "similarity":              round(best_score, 3),
        "source":                  "base_model",
    }


def _own_prediction_by_tx_id() -> dict[int, dict[str, Any]]:
    """Gibt die Vorschläge des eigenen Modells als {transaction_id: prediction}."""
    preds = build_own_predictions()
    return {p["transaction_id"]: p for p in preds}


def _enrich_prediction(
    tx: dict[str, Any],
    category_id: int,
    similarity: float,
    source: str,
) -> dict[str, Any]:
    """Verpackt eine Vorhersage in das API-Format (einheitlich mit eigenem Modell)."""
    return {
        "transaction_id":       tx.get("id"),
        "entry_date":           tx.get("entry_date"),
        "purpose":              (tx.get("purpose") or "")[:120],
        "amount":               tx.get("amount"),
        "applicant_name":       (tx.get("applicant_name") or "")[:80],
        "recipient_name":       (tx.get("recipient_name") or "")[:80],
        "predicted_category_id": category_id,
        "similarity":           similarity,
        "source":               source,
    }


def build_combined_predictions() -> list[dict[str, Any]]:
    """Orchestriert alle drei Stufen und gibt Vorschläge für unkategorisierte
    Transaktionen zurück.

    Reihenfolge pro Transaktion:
      1. Eigenes TF-IDF-Modell (aus auto_categorize.build_predictions)
         → immer wenn das eigene Modell einen Treffer ≥ Threshold liefert
      2. Keyword-Regeln (predict_rules)
         → wenn (1) keinen Treffer hatte
      3. Globales TF-IDF-Basis-Modell (predict_base)
         → wenn (1)+(2) keinen Treffer hatten

    Jede Transaktion bekommt maximal einen Vorschlag (den besten verfügbaren).
    """
    own_by_tx = _own_prediction_by_tx_id()

    # Kategorie-Typ-Lookup (id → typ) für die Validierung
    all_categories = _fetch_all_categories()
    cat_type_by_id: dict[int, str] = {c["id"]: c["typ"] for c in all_categories}

    all_tx = _fetch_all_transactions()
    uncategorized = [
        t for t in all_tx
        if t.get("kategorie") is None and t.get("id")
    ]

    combined: list[dict[str, Any]] = []
    rules_hit = 0
    base_hit = 0

    for tx in uncategorized:
        tx_id = tx["id"]
        amount = tx.get("amount") or 0
        expected_typ = "Einnahme" if amount > 0 else "Ausgabe"

        # ── Stufe 1: Eigenes Modell ──────────────────────────────────────────
        if tx_id in own_by_tx:
            pred = own_by_tx[tx_id]
            predicted_typ = cat_type_by_id.get(pred["predicted_category_id"])
            if predicted_typ == expected_typ:
                combined.append({**pred, "source": "own_model"})
                continue
            # Typ mismatch → Stufe-1-Treffer verwerfen, falle durch zu Stufe 2/3

        # ── Stufe 2: Keyword-Regeln ──────────────────────────────────────────
        rules_result = predict_rules(tx)
        if rules_result is not None:
            combined.append(_enrich_prediction(
                tx,
                rules_result["predicted_category_id"],
                rules_result["similarity"],
                "rules",
            ))
            rules_hit += 1
            continue

        # ── Stufe 3: Globales Basis-Modell ───────────────────────────────────
        base_result = predict_base(tx)
        if base_result is not None:
            combined.append(_enrich_prediction(
                tx,
                base_result["predicted_category_id"],
                base_result["similarity"],
                "base_model",
            ))
            base_hit += 1

    logger.info(
        "Combined predictions: %d own + %d rules + %d base = %d (von %d uncategorized)",
        len(own_by_tx),
        rules_hit,
        base_hit,
        len(combined),
        len(uncategorized),
    )

    return combined