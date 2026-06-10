import type { Transaction, TransactionDto, DebitCreditIndicator } from "@/types/transaction";

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

      splits: dto.splits ?? null,

      transactionCode: dto.transaction_code,

      fundsCode: dto.funds_code,

      settlementTag: dto.settlement_tag,

      bankDeleted: dto.bank_deleted,
    },
  };
}
