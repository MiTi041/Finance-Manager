import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl, AbortError } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils/error";

export interface PartnerData {
  name: string;
  totalAmount: number;
  transactionCount: number;
  isCompany: boolean;
  logoUrl: string | null;
  logoWhiteBackground: boolean;
  logoPadding: boolean;
}

export interface PartnerAnalyticsResult {
  outgoing: PartnerData[];
  incoming: PartnerData[];
}

export function usePartnerAnalyticsData(queryString: string, refreshVersion: number) {
  const [partnerData, setPartnerData] = useState<PartnerAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    try {
      const response = await globalThis.fetch(`${apiBaseUrl}/db/partner/analytics?${queryString}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Partner-Analyse konnte nicht geladen werden");
      }
      setPartnerData(payload as PartnerAnalyticsResult);
      setLoading(false);
    } catch (err) {
      if (err instanceof AbortError || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(getErrorMessage(err));
      setPartnerData(null);
      setLoading(false);
    }
  }, [apiBaseUrl, queryString]);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { partnerData, loading, error, reload: load };
}
