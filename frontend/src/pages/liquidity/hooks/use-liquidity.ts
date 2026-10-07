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
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [entryList, subs, total, pendingTransactions] = await Promise.all([
        fetchLiquidityEntries(),
        fetchChartSubscriptions().catch(() => []),
        fetchBalanceTotal().catch(() => 0),
        fetchPendingTransactions().catch(() => []),
      ]);
      setEntries(entryList);
      setSubscriptions(subs);
      setBalanceTotal(total);
      setPending(pendingTransactions);
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
    reload: load,
    create,
    update,
    remove,
  };
}
