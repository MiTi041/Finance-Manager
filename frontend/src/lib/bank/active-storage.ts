const ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-account-iban.v1";
const LEGACY_ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-bank-scope.v1";

export function readActiveAccountIban(): string {
  if (typeof window === "undefined") return "all";
  return (
    window.localStorage.getItem(ACTIVE_BANK_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_ACTIVE_BANK_STORAGE_KEY) ??
    "all"
  );
}

export function writeActiveAccountIban(iban: string) {
  try {
    window.localStorage.setItem(ACTIVE_BANK_STORAGE_KEY, iban);
    window.localStorage.removeItem(LEGACY_ACTIVE_BANK_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
