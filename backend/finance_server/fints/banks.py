from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BankDefinition:
    key: str
    name: str
    blz: str
    fints_url: str
    bank_logo: str
    can_transfer: bool
    needs_tan_medium_name: bool = False
    username_hint: str | None = None

BANKS: tuple[BankDefinition, ...] = (
    BankDefinition(
        key="ing-diba",
        name="ING Diba",
        blz="50010517",
        fints_url="https://fints.ing.de/fints/",
        bank_logo="images/bank-logos/ing-diba.png",
        can_transfer=False,
    ),
    BankDefinition(
        key="sparkasse-lemgo",
        name="Sparkasse Lemgo",
        blz="48250110",
        fints_url="https://banking-wl5.s-fints-pt-wl.de/fints30",
        bank_logo="images/bank-logos/sparkasse-lemgo.png",
        can_transfer=True,
    ),
    BankDefinition(
        key="dkb",
        name="DKB",
        blz="12030000",
        fints_url="https://fints.dkb.de/fints",
        bank_logo="images/bank-logos/dkb.png",
        can_transfer=True,
        needs_tan_medium_name=False,
    ),
    BankDefinition(
        key="norisbank",
        name="Norisbank",
        blz="10077777",
        fints_url="https://fints.norisbank.de/",
        bank_logo="images/bank-logos/norisbank.png",
        can_transfer=True,
        needs_tan_medium_name=True,
    ),
    #BankDefinition(
    #    key="1822direkt",
    #    name="1822direkt",
    #    blz="50050222",
    #    fints_url="https://fints.1822direkt.com/fints/hbci",
    #    bank_logo="images/bank-logos/1822-direkt.png",
    #    can_transfer=True,
    #),
    BankDefinition(
        key="consorsbank",
        name="Consorsbank",
        blz="70120400",
        fints_url="https://brokerage-hbci.consorsbank.de/hbci",
        bank_logo="images/bank-logos/consorsbank.png",
        can_transfer=True,
username_hint=(
    "Der Anmeldename setzt sich aus Ihrer Kontonummer und der "
    "dreistelligen Berechtigungsnummer zusammen.\n\n"
    "Die Berechtigungsnummer wird direkt an die Kontonummer angehängt. "
    "Bei alleiniger Kontoinhaberschaft lautet sie in der Regel 001."
),
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
