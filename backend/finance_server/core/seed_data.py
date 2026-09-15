from __future__ import annotations

from pathlib import Path

_SEED_DIR = Path(__file__).parent / "seed_data"


def _load_sql(filename: str) -> str:
    path = _SEED_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Seed SQL file is missing: {path}")
    return path.read_text(encoding="utf-8")


SEED_CATEGORIES_SQL = _load_sql("kategorien.sql")
SEED_ZAHLUNGSPARTNER_SQL = _load_sql("zahlungspartner.sql")
SEED_IBANS_SQL = _load_sql("ibans.sql")
SEED_EMPFAENGERKONTEN_SQL = _load_sql("empfaengerkonten.sql")
SEED_BANK_CREDENTIALS_SQL = _load_sql("bank_credentials.sql")
SEED_BANK_ACCOUNTS_SQL = _load_sql("bank_accounts.sql")
SEED_UMSAETZE_SQL = _load_sql("umsaetze.sql")
SEED_APP_SETTINGS_SQL = _load_sql("app_settings.sql")

SEED_SCRIPTS = [
    ("kategorien", SEED_CATEGORIES_SQL),
    ("zahlungspartner", SEED_ZAHLUNGSPARTNER_SQL),
    ("ibans", SEED_IBANS_SQL),
    ("empfaengerkonten", SEED_EMPFAENGERKONTEN_SQL),
    ("bank_credentials", SEED_BANK_CREDENTIALS_SQL),
    ("bank_accounts", SEED_BANK_ACCOUNTS_SQL),
    ("umsaetze", SEED_UMSAETZE_SQL),
    ("app_settings", SEED_APP_SETTINGS_SQL),
]
