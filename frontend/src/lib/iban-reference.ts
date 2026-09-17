import type { IbanZahlungspartnerReference } from "@/types/iban-reference";
import type { Transaction } from "@/types/transaction";
import { normalizeIban } from "@/lib/iban";

export function buildIbanReferenceLookup(references: IbanZahlungspartnerReference[]) {
  return new Map(references.map((reference) => [normalizeIban(reference.iban), reference]));
}

export function resolveTransactionCounterparty(
  transaction: Transaction,
  lookup: Map<string, IbanZahlungspartnerReference>,
): Transaction {
  const iban = normalizeIban(transaction.zahlungspartner.iban);
  const resolved = iban ? lookup.get(iban) : undefined;

  return {
    ...transaction,
    zahlungspartner: {
      ...transaction.zahlungspartner,
      datenbankName: resolved?.zahlungspartnerName || transaction.zahlungspartner.name || "",
      website: resolved?.zahlungspartnerWebsite ?? null,
      logoUrl: resolved?.resolvedLogoUrl ?? resolved?.zahlungspartnerLogoUrl ?? null,
      logoBackground: resolved?.zahlungspartnerLogoBackground ?? "dark",
      logoPadding: resolved?.zahlungspartnerLogoPadding ?? false,
      isCompany: resolved?.zahlungspartnerIsCompany ?? true,
    },
    technisch: {
      ...transaction.technisch,
      isKontotransfer: resolved?.zahlungspartnerIsOwnAccount ?? false,
    },
  };
}

export function resolveTransactionsCounterparty(
  transactions: Transaction[],
  lookup: Map<string, IbanZahlungspartnerReference>,
): Transaction[] {
  return transactions.map((transaction) => resolveTransactionCounterparty(transaction, lookup));
}
