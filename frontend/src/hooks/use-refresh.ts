import { useCallback, useSyncExternalStore } from "react";
import { subscribeToRefresh, getRefreshSnapshot, dispatchRefresh } from "@/lib/refresh-store";

export function useRefresh() {
  const refreshVersion = useSyncExternalStore(subscribeToRefresh, getRefreshSnapshot, getRefreshSnapshot);

  const triggerRefresh = useCallback(() => {
    dispatchRefresh();
  }, []);

  return { refreshVersion, triggerRefresh };
}
