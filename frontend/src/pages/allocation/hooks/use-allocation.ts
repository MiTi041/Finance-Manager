import { useState, useEffect, useCallback } from "react";
import type { AllocationStatus } from "@/lib/allocation";
import { fetchAllocationStatus, recalculateRun, executeTransfer } from "@/lib/allocation";

export function useAllocation(month?: string) {
  const [status, setStatus] = useState<AllocationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllocationStatus(month);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();

    const onRefresh = () => void load();
    window.addEventListener("finance-data-refresh", onRefresh);
    return () => window.removeEventListener("finance-data-refresh", onRefresh);
  }, [load]);

  const recalculate = useCallback(async () => {
    try {
      const data = await recalculateRun(month);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Berechnen");
    }
  }, [month]);

  const transfer = useCallback(async (runBucketId: number) => {
    setTransferring(runBucketId);
    try {
      await executeTransfer(runBucketId);
      await load();
    } catch (e) {
      throw e;
    } finally {
      setTransferring(null);
    }
  }, [load]);

  return { status, loading, error, recalculate, transfer, transferring };
}
