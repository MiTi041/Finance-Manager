import { useCallback, useEffect, useState } from "react";

import {
  createLiquidityEntry,
  deleteLiquidityEntry,
  fetchBalanceTotal,
  fetchLiquidityEntries,
  fetchPendingTransactions,
  updateLiquidityEntry,
  type LiquidityEntry,
  type LiquidityEntryInput,
  type PendingTransactionDto,
} from "@/lib/liquidity";
import { getErrorMessage } from "@/lib/utils/error";
import {
  fetchChartSubscriptions,
  type Subscription,
} from "@/pages/subscriptions/hooks/use-subscriptions";

export function useLiquidity() {
  const [entries, setEntries] = useState<LiquidityEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pending, setPending] = useState<PendingTransactionDto[]>([]);
  const [balanceTotal, setBalanceTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setSourcesError(null);
    try {
      const entryList = await fetchLiquidityEntries();
      const [subsResult, balanceResult, pendingResult] = await Promise.allSettled([
        fetchChartSubscriptions(),
        fetchBalanceTotal(),
        fetchPendingTransactions(),
      ]);
      setEntries(entryList);
      setSubscriptions(subsResult.status === "fulfilled" ? subsResult.value : []);
      setBalanceTotal(balanceResult.status === "fulfilled" ? balanceResult.value : null);
      setPending(pendingResult.status === "fulfilled" ? pendingResult.value : []);
      if (
        subsResult.status === "rejected" ||
        balanceResult.status === "rejected" ||
        pendingResult.status === "rejected"
      ) {
        setSourcesError(
          "Automatische Daten (Kontostände, Abos, Vorgemerkte) konnten nicht vollständig geladen werden.",
        );
      }
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (input: LiquidityEntryInput) => {
    const created = await createLiquidityEntry(input);
    setEntries((prev) => [...prev, created]);
  }, []);

  const update = useCallback(async (id: number, input: LiquidityEntryInput) => {
    const updated = await updateLiquidityEntry(id, input);
    setEntries((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteLiquidityEntry(id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  return {
    entries,
    subscriptions,
    pending,
    balanceTotal,
    loading,
    error,
    sourcesError,
    reload: load,
    create,
    update,
    remove,
  };
}
