import { useCallback, useEffect, useState } from "react";

import {
  createLiquidityEntry,
  deleteLiquidityEntry,
  fetchBalanceTotal,
  fetchLiquidityEntries,
  updateLiquidityEntry,
  type LiquidityEntry,
  type LiquidityEntryInput,
} from "@/lib/liquidity";
import { getErrorMessage } from "@/lib/utils/error";

export function useLiquidity() {
  const [entries, setEntries] = useState<LiquidityEntry[]>([]);
  const [balanceTotal, setBalanceTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const entryList = await fetchLiquidityEntries();
      const balance = await fetchBalanceTotal().catch(() => null);
      setEntries(entryList);
      setBalanceTotal(balance);
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
    balanceTotal,
    loading,
    error,
    reload: load,
    create,
    update,
    remove,
  };
}
