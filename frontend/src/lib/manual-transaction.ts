type ManualSourceTransaction = {
  konto: { iban: string };
  daten: { buchungsdatum: Date | string | null };
  betrag: { wert: number };
  zahlungspartner: { name: string; iban: string };
  texte: { verwendungszweck: string; anmerkung: string };
  technisch: { kategorieId: number | null };
};

export type ManualTransactionFields = {
  date: string;
  amount: number;
  recipient_name: string | null;
  recipient_iban: string | null;
  purpose: string | null;
  category: number | null;
  note: string | null;
};

function toIsoDate(value: Date | string | null): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string" && value.length >= 10) {
    return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function transactionToManualInput(
  transaction: ManualSourceTransaction,
): ManualTransactionFields {
  return {
    date: toIsoDate(transaction.daten.buchungsdatum),
    amount: transaction.betrag.wert,
    recipient_name: transaction.zahlungspartner.name || null,
    recipient_iban: transaction.zahlungspartner.iban || null,
    purpose: transaction.texte.verwendungszweck || null,
    category: transaction.technisch.kategorieId,
    note: transaction.texte.anmerkung || null,
  };
}
