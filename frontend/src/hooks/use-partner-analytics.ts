import { useMemo } from "react";
import type { Transaction } from "@/types/transaction";

export interface PartnerAnalytics {
  name: string;
  totalAmount: number;
  transactionCount: number;
  logoUrl: string | null;
  logoWhiteBackground: boolean;
  logoPadding: boolean;
  isCompany: boolean;
}

export function usePartnerAnalytics({
  transactions = [],
  deletedBankTransactionsIncluded = false,
}: {
  transactions?: Transaction[];
  deletedBankTransactionsIncluded?: boolean;
} = {}) {
  const partnerData = useMemo(() => {
    const txs = deletedBankTransactionsIncluded
      ? transactions
      : transactions.filter((t) => !t.technisch.bankDeleted);

    const map = new Map<string, PartnerAnalytics>();

    txs.forEach((t) => {
      const name = t.zahlungspartner.datenbankName || t.zahlungspartner.name || "Unbekannt";
      const existing = map.get(name);
      if (existing) {
        existing.totalAmount += t.betrag.wert;
        existing.transactionCount += 1;
      } else {
        map.set(name, {
          name,
          totalAmount: t.betrag.wert,
          transactionCount: 1,
          logoUrl: t.zahlungspartner.logoUrl,
          logoWhiteBackground: t.zahlungspartner.logoWhiteBackground,
          logoPadding: t.zahlungspartner.logoPadding,
          isCompany: t.zahlungspartner.isCompany,
        });
      }
    });

    return map;
  }, [transactions, deletedBankTransactionsIncluded]);

  const outgoing = useMemo(
    () =>
      Array.from(partnerData.values())
        .filter((p) => p.totalAmount < 0)
        .map((p) => ({ ...p, totalAmount: Math.abs(p.totalAmount) }))
        .sort((a, b) => b.totalAmount - a.totalAmount),
    [partnerData],
  );

  const incoming = useMemo(
    () =>
      Array.from(partnerData.values())
        .filter((p) => p.totalAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount),
    [partnerData],
  );

  return { outgoing, incoming };
}
