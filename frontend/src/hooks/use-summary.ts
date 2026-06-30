import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl, AbortError } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils/error";

export interface SummaryData {
  balance: number;
  incomes: number;
  expenses: number;
  transaction_count: number;
}

export function useSummary(queryString: string, refreshVersion: number) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
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
      const response = await globalThis.fetch(`${apiBaseUrl}/db/summary?${queryString}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Zusammenfassung konnte nicht geladen werden");
      }
      setSummary(payload as SummaryData);
      setLoading(false);
    } catch (err) {
      if (err instanceof AbortError || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(getErrorMessage(err));
      setSummary(null);
      setLoading(false);
    }
  }, [apiBaseUrl, queryString]);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { summary, loading, error, reload: load };
}
