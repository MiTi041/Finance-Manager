import { useEffect, useState } from "react";

import {
  fetchRecipientAccountsReferenceData,
  resolveRecipientAccountLogoSrc,
} from "@/lib/recipient-accounts";
import { fetchZahlungspartnerReferenceData, type LogoBackground } from "@/lib/zahlungspartner";
import { resolveZahlungspartnerLogoSrc } from "@/lib/bank/zahlungspartner-logo";
import { normalizeIban } from "@/lib/iban";

export type RecipientAccountLogo = {
  src?: string;
  background?: LogoBackground | null;
  isCompany?: boolean;
  padding?: boolean;
};

/**
 * Löst Logos für Empfängerkonten auf – genau wie die Einstellungen:
 * eigenes hochgeladenes Logo, sonst das Logo des per IBAN verknüpften
 * Zahlungspartners.
 */
export function useRecipientAccountLogos(): Map<number, RecipientAccountLogo> {
  const [logos, setLogos] = useState<Map<number, RecipientAccountLogo>>(new Map());

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchRecipientAccountsReferenceData(),
      fetchZahlungspartnerReferenceData(),
    ])
      .then(([recipientPayload, zahlungspartnerPayload]) => {
        if (cancelled) return;

        const mappingByIban = new Map(
          (zahlungspartnerPayload.iban_mappings ?? []).map((m) => [normalizeIban(m.iban), m]),
        );

        const next = new Map<number, RecipientAccountLogo>();
        for (const account of recipientPayload.recipient_accounts ?? []) {
          const own = resolveRecipientAccountLogoSrc(account);
          if (own) {
            next.set(account.id, { src: own, isCompany: true });
            continue;
          }

          const mapping = mappingByIban.get(normalizeIban(account.iban));
          if (!mapping) continue;

          next.set(account.id, {
            src: resolveZahlungspartnerLogoSrc(
              mapping.zahlungspartner_logo_url,
              mapping.f_zahlungspartner_id,
              mapping.zahlungspartner_local_logo_path,
            ),
            background: mapping.zahlungspartner_logo_background,
            isCompany: mapping.zahlungspartner_is_company ?? true,
            padding: mapping.zahlungspartner_logo_padding ?? false,
          });
        }

        setLogos(next);
      })
      .catch(() => {
        if (!cancelled) setLogos(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return logos;
}
