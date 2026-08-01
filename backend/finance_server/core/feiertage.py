from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta

import holidays

BUNDESLAENDER: dict[str, str] = {
    "bw": "Baden-Württemberg",
    "by": "Bayern",
    "be": "Berlin",
    "bb": "Brandenburg",
    "hb": "Bremen",
    "hh": "Hamburg",
    "he": "Hessen",
    "mv": "Mecklenburg-Vorpommern",
    "ni": "Niedersachsen",
    "nw": "Nordrhein-Westfalen",
    "rp": "Rheinland-Pfalz",
    "sl": "Saarland",
    "sn": "Sachsen",
    "st": "Sachsen-Anhalt",
    "sh": "Schleswig-Holstein",
    "th": "Thüringen",
}


def feiertage(state: str, year: int) -> set[date]:
    return set(holidays.country_holidays("DE", subdiv=state.upper(), years=year))


def letzter_arbeitstag(state: str, year: int, month: int) -> date:
    d = date(year, month, monthrange(year, month)[1])
    feier = feiertage(state, year)
    while d.weekday() >= 5 or d in feier:
        d -= timedelta(days=1)
    return d


def holiday_dates(state: str, from_year: int, to_year: int) -> list[str]:
    return sorted(
        d.isoformat() for year in range(from_year, to_year + 1) for d in feiertage(state, year)
    )
