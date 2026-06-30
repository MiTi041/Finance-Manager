import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl, AbortError } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils/error";

export interface AccountBalanceData {
  account_iban: string;
  balance: number;
}

export function useAccountBalances(queryString: string, refreshVersion: number) {
  const [balances, setBalances] = useState<AccountBalanceData[]>([]);
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
      const response = await globalThis.fetch(`${apiBaseUrl}/db/account-balances?${queryString}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Kontosalden konnten nicht geladen werden");
      }
      setBalances(Array.isArray(payload) ? payload : []);
      setLoading(false);
    } catch (err) {
      if (err instanceof AbortError || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(getErrorMessage(err));
      setBalances([]);
      setLoading(false);
    }
  }, [apiBaseUrl, queryString]);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { balances, loading, error, reload: load };
}
