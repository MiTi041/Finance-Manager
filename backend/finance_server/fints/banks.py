from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BankDefinition:
    key: str
    name: str
    blz: str = ""
    fints_url: str = ""
    bank_logo: str = ""
    # Optional logo variant shown in dark mode. Falls back to bank_logo.
    bank_logo_dark: str = ""
    # Extra padding around the logo in pixels. 0 keeps the default spacing.
    logo_padding: int = 0
    can_transfer: bool = False
    # SEPA-Instant (Echtzeit) wird von dieser Bank unterstützt. False blendet
    # die Echtzeit-Option bei Überweisungen von/an diese Bank aus.
    sepa_express: bool = True
    # Fixed IBAN the provider pays out from / sends with (e.g. Scalable's
    # Verrechnungskonto). Only set for manual providers.
    sender_iban: str | None = None
    needs_tan_medium_name: bool = False
    decoupled_login: bool = False
    username_hint: str | None = None

    @property
    def is_manual(self) -> bool:
        """Banks without a FinTS endpoint are maintained manually."""
        return not self.fints_url

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
        decoupled_login=True,
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
    BankDefinition(
        key="trade-republic",
        name="Trade Republic",
        bank_logo="images/bank-logos/trade-republic.png",
        bank_logo_dark="images/bank-logos/trade-republic_dark.png",
        logo_padding=8
    ),
    BankDefinition(
        key="scalable",
        name="Scalable Capital",
        bank_logo="images/bank-logos/scalable-capital.png",
        sender_iban="DE86700700100922050000",
    ),
    BankDefinition(
        key="revolut",
        name="Revolut",
        bank_logo="images/bank-logos/revolut.png",
        bank_logo_dark="images/bank-logos/revolut_dark.png",
        logo_padding=8
    ),
    BankDefinition(
        key="chase",
        name="Chase",
        bank_logo="images/bank-logos/chase.png",
        sepa_express=False,
    ),
    BankDefinition(
        key="fnz",
        name="FNZ",
        bank_logo="images/bank-logos/fnz.png",
        bank_logo_dark="images/bank-logos/fnz_dark.png",
    ),
    BankDefinition(
        key="c24",
        name="C24",
        bank_logo="images/bank-logos/c24.png",
        bank_logo_dark="images/bank-logos/c24_dark.png",
    ),
    BankDefinition(
        key="manual",
        name="Manuelle Bankzugänge",
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
