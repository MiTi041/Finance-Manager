import { useState, useEffect, useCallback } from "react";
import type { AllocationStatus } from "@/lib/allocation";
import { fetchAllocationStatus, recalculateRun, executeTransfer, executeSavingsPlanTransfer } from "@/lib/allocation";

export function useAllocation(month?: string) {
  const [status, setStatus] = useState<AllocationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<number | null>(null);

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const data = await fetchAllocationStatus(month);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load(true);
  }, [load]);

  const recalculate = useCallback(async () => {
    try {
      const data = await recalculateRun(month, true);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Berechnen");
    }
  }, [month]);

  const transfer = useCallback(async (runBucketId: number, tan?: string, amount?: number, instant?: boolean) => {
    if (amount != null && amount <= 0) throw new Error("Betrag muss positiv sein");
    setTransferring(runBucketId);
    try {
      await executeTransfer(runBucketId, tan, amount, instant);
      await load();
    } finally {
      setTransferring(null);
    }
  }, [load]);

  const transferSavings = useCallback(async (planId: number, tan?: string, amount?: number, instant?: boolean) => {
    if (amount != null && amount <= 0) throw new Error("Betrag muss positiv sein");
    await executeSavingsPlanTransfer(planId, tan, amount, instant);
    await load();
  }, [load]);

  return { status, loading, error, load, recalculate, transfer, transferring, transferSavings };
}
