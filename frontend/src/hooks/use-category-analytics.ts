import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl, AbortError } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils/error";

export interface CategoryAnalyticsData {
  category_id: number;
  name: string;
  typ: string;
  icon: string | null;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

export function useCategoryAnalytics(queryString: string, refreshVersion: number) {
  const [categories, setCategories] = useState<CategoryAnalyticsData[]>([]);
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
      const response = await globalThis.fetch(`${apiBaseUrl}/db/categories/analytics?${queryString}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Kategorie-Analyse konnte nicht geladen werden");
      }
      setCategories(Array.isArray(payload) ? payload : []);
      setLoading(false);
    } catch (err) {
      if (err instanceof AbortError || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(getErrorMessage(err));
      setCategories([]);
      setLoading(false);
    }
  }, [apiBaseUrl, queryString]);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { categories, loading, error, reload: load };
}
