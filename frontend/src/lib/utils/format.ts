export function formatDate(value?: Date | string | null) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat("de-DE").format(parsed);
}

export function formatAmount(value?: number | null, currency?: string | null) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number(value ?? 0));
}
