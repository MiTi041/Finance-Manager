import { useCallback, useEffect, useState } from "react";
import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";

export function useBankCredentials(refreshVersion: number) {
  const [banks, setBanks] = useState<StoredBankCredentials[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await fetchBankCredentials();
      setBanks(result);
    } catch {
      setBanks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  return { banks, loading, reload: load };
}
