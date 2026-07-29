from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from typing import Any


def aktuellen_taeglichen_zins(datum: date, zinsverlauf: list[dict[str, Any]]) -> float:
    aktueller_zins = 0.0
    sortiert = sorted(zinsverlauf, key=lambda e: e["datum"])
    for eintrag in sortiert:
        if datum >= eintrag["datum"]:
            aktueller_zins = eintrag["zinssatz"]
        else:
            break
    return aktueller_zins / 360


def _letzter_monatstag(d: date) -> int:
    return monthrange(d.year, d.month)[1]


def berechne_endguthaben(
    startkapital: float,
    monatliche_einzahlung: float,
    zinsverlauf: list[dict[str, Any]],
    start_datum: date,
    end_datum: date,
    anfangs_offene_zinsen: float = 0,
    payout_days: list[int] | None = None,
) -> tuple[float, float]:
    guthaben = startkapital
    gesamte_einzahlungen = startkapital
    offene_zinsen = anfangs_offene_zinsen
    aktuelles_datum = start_datum

    while aktuelles_datum <= end_datum:
        if payout_days:
            last = _letzter_monatstag(aktuelles_datum)
            for pd in payout_days:
                resolved = pd if pd > 0 else last
                if aktuelles_datum.day == resolved:
                    guthaben += monatliche_einzahlung
                    gesamte_einzahlungen += monatliche_einzahlung
                    break
        else:
            morgen = aktuelles_datum + timedelta(days=1)
            if morgen.day == 1:
                guthaben += monatliche_einzahlung
                gesamte_einzahlungen += monatliche_einzahlung
        morgen = aktuelles_datum + timedelta(days=1)
        if morgen.day == 1:
            guthaben += offene_zinsen
            offene_zinsen = 0.0
        tageszins = guthaben * aktuellen_taeglichen_zins(aktuelles_datum, zinsverlauf)
        offene_zinsen += tageszins
        aktuelles_datum += timedelta(days=1)

    return guthaben, gesamte_einzahlungen


def berechne_monatsrate(
    aktuelles_guthaben: float,
    zielbetrag: float,
    zinsverlauf: list[dict[str, Any]],
    start_datum: date,
    end_datum: date,
    eps: float = 0.01,
    payout_days: list[int] | None = None,
) -> float:
    if start_datum >= end_datum:
        return max(0, zielbetrag - aktuelles_guthaben)

    low = 0.0
    high = zielbetrag * 2

    while high - low > eps:
        mid = (low + high) / 2
        endguthaben = berechne_endguthaben(
            aktuelles_guthaben, mid, zinsverlauf, start_datum, end_datum,
            payout_days=payout_days,
        )[0]
        if endguthaben < zielbetrag:
            low = mid
        else:
            high = mid

    return low
