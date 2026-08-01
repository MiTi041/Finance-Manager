import { useMemo } from "react";

import { getServerBaseUrl } from "@/lib/bank/zahlungspartner-logo";
import { type Transaction } from "@/types/transaction";

export type SubscriptionOverride = {
  name: string;
  logoUrl?: string;
  datenbankName?: string;
  logoWhiteBackground?: boolean;
  logoPadding?: boolean;
  isCompany?: boolean;
};

export function useTransactionDerivations(
  transaction: Transaction,
  allTransactions: Transaction[],
  subscriptionOverride: SubscriptionOverride | null,
) {
  const isRefund =
    transaction.betrag.wert > 0 && transaction.technisch.refundRefTransactionId != null;

  const linkedRefundTotal = useMemo(() => {
    if (transaction.betrag.wert >= 0) return 0;
    return allTransactions
      .filter((t) => t.technisch.refundRefTransactionId === transaction.id)
      .reduce((sum, t) => sum + Math.abs(t.betrag.wert), 0);
  }, [transaction, allTransactions]);

  const linkedOriginalAmount = useMemo(() => {
    if (!transaction.technisch.refundRefTransactionId) return 0;
    const original = allTransactions.find(
      (t) => t.id === transaction.technisch.refundRefTransactionId,
    );
    return original ? Math.abs(original.betrag.wert) : 0;
  }, [transaction, allTransactions]);

  const refundRemaining = useMemo(
    () => Math.max(0, transaction.betrag.wert - linkedOriginalAmount),
    [transaction.betrag.wert, linkedOriginalAmount],
  );

  const hasRefunds = linkedRefundTotal > 0;

  const displayAmount = useMemo(() => {
    if (isRefund) return refundRemaining;
    if (hasRefunds) return Math.min(0, transaction.betrag.wert + linkedRefundTotal);
    return transaction.betrag.wert;
  }, [transaction, linkedOriginalAmount, linkedRefundTotal, isRefund, hasRefunds]);

  const showRefundSection =
    transaction.betrag.wert > 0 ||
    (transaction.betrag.wert < 0 &&
      allTransactions.some((t) => t.technisch.refundRefTransactionId === transaction.id));

  const purpose = transaction.texte.verwendungszweck || "";
  const additionalPurpose = transaction.texte.zusatzVerwendungszweck || "";
  const deviateApplicant = transaction.zahlungspartner.abweichenderAuftraggeberName || "";

  const partnerLogoSrc = transaction.zahlungspartner.logoUrl || undefined;
  const overrideLogoSrc = subscriptionOverride?.logoUrl
    ? subscriptionOverride.logoUrl.startsWith("/")
      ? `${getServerBaseUrl()}${subscriptionOverride.logoUrl}`
      : subscriptionOverride.logoUrl
    : undefined;

  const isEntgeltabschluss =
    transaction.texte.buchungstext &&
    (transaction.texte.buchungstext.toLowerCase() === "entgeltabschluss" ||
      transaction.texte.buchungstext.toLowerCase() === "abschluss") &&
    transaction.konto.blz === "48250110";

  const displayName = isEntgeltabschluss
    ? "Entgeltabschluss"
    : subscriptionOverride?.datenbankName ||
      subscriptionOverride?.name ||
      transaction.zahlungspartner.datenbankName ||
      transaction.zahlungspartner.name ||
      "–";

  const overridePartnerName =
    subscriptionOverride && transaction.zahlungspartner.name !== displayName
      ? transaction.zahlungspartner.datenbankName || transaction.zahlungspartner.name
      : null;

  const collapsedPurpose = purpose || additionalPurpose;

  return {
    isRefund,
    linkedRefundTotal,
    linkedOriginalAmount,
    refundRemaining,
    hasRefunds,
    displayAmount,
    showRefundSection,
    purpose,
    additionalPurpose,
    deviateApplicant,
    partnerLogoSrc,
    overrideLogoSrc,
    isEntgeltabschluss,
    displayName,
    overridePartnerName,
    collapsedPurpose,
  };
}
