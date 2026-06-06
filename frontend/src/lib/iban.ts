export function normalizeIban(value?: string | null): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized.length >= 15 ? normalized : "";
}
