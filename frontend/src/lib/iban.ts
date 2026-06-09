export function normalizeIban(value?: string | null): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (normalized.startsWith("PAYPAL:")) return normalized;
  return normalized.length >= 15 ? normalized : "";
}
