import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl, AbortError } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils/error";
import { mapTransaction } from "@/lib/mappers";
import type { Transaction, TransactionDto } from "@/types/transaction";

export function useTransactions(queryString: string, refreshVersion: number) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setRefreshing(true);
    try {
      const response = await globalThis.fetch(`${apiBaseUrl}/db/transactions?${queryString}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Transaktionen konnten nicht geladen werden");
      }
      const raw: TransactionDto[] = Array.isArray(payload?.transactions) ? payload.transactions : [];
      setTransactions(raw.map(mapTransaction));
      setLoading(false);
    } catch (err) {
      if (err instanceof AbortError || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(getErrorMessage(err));
      setTransactions([]);
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, [apiBaseUrl, queryString]);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { transactions, loading, refreshing, error, reload: load };
}
