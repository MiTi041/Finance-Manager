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
  subscriptionOverride: SubscriptionOverride | null,
) {
  const isRefund =
    transaction.betrag.wert > 0 && transaction.refundLinks.length > 0;

  const linkedRefundTotal =
    transaction.betrag.wert < 0 ? transaction.betrag.refundTotal : 0;

  const refundRemaining = useMemo(
    () => Math.max(0, transaction.betrag.wert - transaction.refundAttributed),
    [transaction.betrag.wert, transaction.refundAttributed],
  );

  const hasRefunds = linkedRefundTotal > 0;

  const displayAmount = useMemo(() => {
    if (isRefund) return refundRemaining;
    if (hasRefunds) return Math.min(0, transaction.betrag.wert + linkedRefundTotal);
    return transaction.betrag.wert;
  }, [transaction, linkedRefundTotal, isRefund, hasRefunds, refundRemaining]);

  const showRefundSection =
    transaction.betrag.wert > 0 ||
    (transaction.betrag.wert < 0 && linkedRefundTotal > 0);

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
