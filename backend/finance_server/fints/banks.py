from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BankDefinition:
    key: str
    name: str
    blz: str
    fints_url: str
    bank_logo: str

BANKS: tuple[BankDefinition, ...] = (
    BankDefinition(
        key="ing-diba",
        name="ING Diba",
        blz="50010517",
        fints_url="https://fints.ing.de/fints/",
        bank_logo="images/bank-logos/ing-diba.png",
    ),
    BankDefinition(
        key="sparkasse-lemgo",
        name="Sparkasse Lemgo",
        blz="48250110",
        fints_url="https://banking-wl5.s-fints-pt-wl.de/fints30",
        bank_logo="images/bank-logos/sparkasse-lemgo.png",
    ),
)


def get_bank_definition(bank_key: str) -> BankDefinition:
    normalized_key = bank_key.strip().lower()
    for bank in BANKS:
        if bank.key == normalized_key:
            return bank

    for bank in BANKS:
        if normalized_key in bank.key or bank.key in normalized_key:
            return bank

    for bank in BANKS:
        if normalized_key in bank.name.lower():
            return bank

    raise KeyError(f"Unknown bank key: {bank_key}")


def list_bank_definitions() -> tuple[BankDefinition, ...]:
    return BANKS
