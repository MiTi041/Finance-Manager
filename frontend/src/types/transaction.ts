/**
 * Rohdaten direkt aus Bank/API/CSV.
 * Entspricht 1:1 dem externen Datenformat.
 */
export interface TransactionDto {
  id: number;

  account_iban: string;
  account_bic: string;
  account_accountnumber: string;
  account_subaccount: string;
  account_blz: string;

  /**
   * MT940 Debit/Credit Indicator
   * C = Credit (Geldeingang)
   * D = Debit (Geldausgang)
   */
  status: string;

  /**
   * Optionaler Funds-/Reversal-Code
   * Oft bankspezifisch.
   */
  funds_code: string;

  transaction_id: string;
  customer_reference: string;
  bank_reference: string;

  extra_details: string;

  date: Date | null;
  entry_date: Date | null;
  guessed_entry_date: Date | null;

  transaction_reference: string;
  transaction_code: string;

  posting_text: string;
  prima_nota: string;

  purpose: string;
  additional_purpose: string;

  end_to_end_reference: string;
  additional_position_reference: string;
  additional_position_date: string;

  applicant_bic: string;
  applicant_iban: string;
  applicant_name: string;

  recipient_name: string;

  deviate_applicant: string;
  deviate_recipient: string;

  gvc_applicant_iban: string;
  gvc_applicant_bic: string;

  applicant_creditor_id: string;
  debitor_identifier: string;

  return_debit_notes: string;

  purpose_code: string;

  FRST_ONE_OFF_RECC: string;

  old_SEPA_CI: string;
  old_SEPA_additional_position_reference: string;

  settlement_tag: string;

  original_amount: number;
  amount: number;

  currency: string;

  transaction_hash: string;

  kategorie: number | null;
  note: string | null;

  created_at: Date;
}

/**
 * Fachliche Buchungsrichtung.
 */
export enum TransactionDirection {
  Incoming = "INCOMING",
  Outgoing = "OUTGOING",
}

/**
 * Rohcode aus MT940.
 */
export type DebitCreditIndicator = "C" | "D";

/**
 * ISO-4217 Currency Codes.
 */
export type CurrencyCode = "EUR" | "USD" | "CHF" | "GBP";

/**
 * Internes Domainmodell.
 */
export interface Transaction {
  id: number;

  konto: {
    iban: string;
    bic: string;
    kontonummer: string;
    unterkonto: string;
    blz: string;
  };

  /**
   * Originaler MT940 Code.
   */
  debitCreditIndicator: DebitCreditIndicator;

  referenzen: {
    fintsTransactionId: string;
    kundenreferenz: string;
    bankreferenz: string;
    endToEndReferenz: string;
    transaktionsreferenz: string;
  };

  daten: {
    buchungsdatum: Date | null;
    wertstellungsdatum: Date | null;
    geschaetztesBuchungsdatum: Date | null;
    erstelltAm: Date;
  };

  texte: {
    buchungstext: string;
    primaNota: string;
    verwendungszweck: string;
    zusatzVerwendungszweck: string;
    extraDetails: string;
    anmerkung: string;
  };

  zahlungspartner: {
    name: string;
    datenbankName: string;
    website: string | null;
    logoUrl: string | null;
    logoWhiteBackground: boolean;
    logoPadding: boolean;
    isCompany: boolean;

    iban: string;
    bic: string;

    auftraggeberName: string;
    empfaengerName: string;

    abweichenderAuftraggeberName: string;
  };

  sepa: {
    glaeubigerId: string;
    mandatsreferenz: string;

    sequenztyp: string;

    purposeCode: string;

    gvcIban: string;
    gvcBic: string;
  };

  betrag: {
    wert: number;
    originalWert: number;
    waehrung: CurrencyCode | string;
  };

  technisch: {
    hash: string;

    kategorieId: number | null;

    transactionCode: string;

    /**
     * Optionaler Bankcode
     * z.B. Reversal etc.
     */
    fundsCode: string;

    settlementTag: string;
  };
}

/**
 * Validierung des Rohcodes.
 */
function mapDebitCreditIndicator(
  indicator: string,
  amount?: number,
): DebitCreditIndicator {
  const normalized = indicator?.trim().toUpperCase();

  if (normalized === "C" || normalized === "D") {
    return normalized;
  }

  if (normalized?.endsWith("C") || normalized?.endsWith("D")) {
    return normalized.slice(-1) as DebitCreditIndicator;
  }

  if (typeof amount === "number" && Number.isFinite(amount)) {
    return amount < 0 ? "D" : "C";
  }

  return "C";
}

/**
 * DTO -> Domainmodell
 */
export function mapTransaction(dto: TransactionDto): Transaction {
  const debitCreditIndicator = mapDebitCreditIndicator(dto.status, dto.amount);

  return {
    id: dto.id,

    konto: {
      iban: dto.account_iban,
      bic: dto.account_bic,
      kontonummer: dto.account_accountnumber,
      unterkonto: dto.account_subaccount,
      blz: dto.account_blz,
    },

    debitCreditIndicator,

    referenzen: {
      fintsTransactionId: dto.transaction_id,

      kundenreferenz: dto.customer_reference,

      bankreferenz: dto.bank_reference,

      endToEndReferenz: dto.end_to_end_reference,

      transaktionsreferenz: dto.transaction_reference,
    },

    daten: {
      buchungsdatum: dto.date,

      wertstellungsdatum: dto.entry_date,

      geschaetztesBuchungsdatum: dto.guessed_entry_date,

      erstelltAm: dto.created_at,
    },

    texte: {
      buchungstext: dto.posting_text,

      primaNota: dto.prima_nota,

      verwendungszweck: dto.purpose,

      zusatzVerwendungszweck: dto.additional_purpose,

      extraDetails: dto.extra_details,

      anmerkung: dto.note ?? "",
    },

    zahlungspartner: {
      name: dto.applicant_name || dto.recipient_name || "",
      datenbankName: "",
      website: null,
      logoUrl: null,
      logoWhiteBackground: false,
      logoPadding: true,
      isCompany: true,

      iban: dto.applicant_iban,

      bic: dto.applicant_bic,

      auftraggeberName: dto.applicant_name,

      empfaengerName: dto.recipient_name,

      abweichenderAuftraggeberName: dto.deviate_applicant,
    },

    sepa: {
      glaeubigerId: dto.applicant_creditor_id,

      mandatsreferenz: dto.debitor_identifier,

      sequenztyp: dto.FRST_ONE_OFF_RECC,

      purposeCode: dto.purpose_code,

      gvcIban: dto.gvc_applicant_iban,

      gvcBic: dto.gvc_applicant_bic,
    },

    betrag: {
      wert: dto.amount,

      originalWert: dto.original_amount,

      waehrung: dto.currency,
    },

    technisch: {
      hash: dto.transaction_hash,

      kategorieId: dto.kategorie,

      transactionCode: dto.transaction_code,

      fundsCode: dto.funds_code,

      settlementTag: dto.settlement_tag,
    },
  };
}
