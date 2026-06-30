let globalVersion = 0;
const listeners = new Set<() => void>();

export function subscribeToRefresh(handler: () => void) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function getRefreshSnapshot() {
  return globalVersion;
}

export function dispatchRefresh() {
  globalVersion += 1;
  listeners.forEach((fn) => fn());

  try {
    window.dispatchEvent(new CustomEvent("finance-data-refresh"));
    window.dispatchEvent(new CustomEvent("finance-bank-credentials-changed"));
    window.dispatchEvent(new CustomEvent("finance-reference-data-changed"));
  } catch {
    // ignore if running in non-browser environment
  }
}
