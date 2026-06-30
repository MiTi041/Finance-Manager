import { useCallback, useEffect, useState } from "react";
import { fetchIbanZahlungspartnerReferences } from "@/lib/reference-data";
import type { IbanZahlungspartnerReference, IbanZahlungspartnerReferenceDto } from "@/types/iban-reference";

export function useIbanReferences(refreshVersion: number) {
  const [references, setReferences] = useState<IbanZahlungspartnerReference[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw: IbanZahlungspartnerReferenceDto[] =
        await fetchIbanZahlungspartnerReferences().catch(() => []);
      setReferences(
        raw.map((ref) => ({
          iban: ref.iban,
          zahlungspartnerId: ref.f_zahlungspartner_id,
          zahlungspartnerName: ref.zahlungspartner_name,
          zahlungspartnerWebsite: ref.zahlungspartner_website ?? null,
          zahlungspartnerLogoUrl: ref.zahlungspartner_logo_url ?? null,
          zahlungspartnerLogoWhiteBackground: ref.zahlungspartner_logo_white_background ?? false,
          zahlungspartnerLogoPadding: ref.zahlungspartner_logo_padding ?? false,
          zahlungspartnerIsCompany: Boolean(ref.zahlungspartner_is_company ?? true),
          resolvedLogoUrl: ref.resolved_logo_url ?? null,
        })),
      );
    } catch {
      setReferences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  return { references, loading, reload: load };
}
