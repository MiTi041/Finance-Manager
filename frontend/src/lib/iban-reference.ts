import type { IbanKontoinhaberReference } from "@/types/iban-reference";
import type { Transaction } from "@/types/transaction";

function normalizeIban(value?: string | null) {
  if (!value) return "";

  return value.replace(/\s+/g, "").toUpperCase();
}

export function buildIbanReferenceLookup(
  references: IbanKontoinhaberReference[],
) {
  return new Map(
    references.map((reference) => [normalizeIban(reference.iban), reference]),
  );
}

export function resolveTransactionCounterparty(
  transaction: Transaction,
  lookup: Map<string, IbanKontoinhaberReference>,
): Transaction {
  const iban = normalizeIban(transaction.zahlungspartner.iban);
  const resolved = iban ? lookup.get(iban) : undefined;

  return {
    ...transaction,
    zahlungspartner: {
      ...transaction.zahlungspartner,
      datenbankName:
        resolved?.kontoinhaberName || transaction.zahlungspartner.name || "",
      website: resolved?.kontoinhaberWebsite ?? null,
      logoUrl:
        resolved?.resolvedLogoUrl ?? resolved?.kontoinhaberLogoUrl ?? null,
      logoWhiteBackground: resolved?.kontoinhaberLogoWhiteBackground ?? false,
      logoPadding: resolved?.kontoinhaberLogoPadding ?? false,
      isCompany: resolved?.kontoinhaberIsCompany ?? true,
    },
  };
}

export function resolveTransactionsCounterparty(
  transactions: Transaction[],
  lookup: Map<string, IbanKontoinhaberReference>,
): Transaction[] {
  return transactions.map((transaction) =>
    resolveTransactionCounterparty(transaction, lookup),
  );
}
