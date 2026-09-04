const dateFormatter = new Intl.DateTimeFormat("de-DE");
const amountFormatters = new Map<string, Intl.NumberFormat>();

function getAmountFormatter(currency: string) {
  let formatter = amountFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
    });
    amountFormatters.set(currency, formatter);
  }
  return formatter;
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return dateFormatter.format(parsed);
}

export function formatAmount(value?: number | null, currency?: string | null) {
  return getAmountFormatter(currency || "EUR").format(Number(value ?? 0));
}

export function formatRelativeAge(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "Gerade aktualisiert";
  }
  if (minutes < 60) {
    return `Vor ${minutes} Min.`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Vor ${hours} Std.`;
  }
  return `Vor ${Math.floor(hours / 24)} Tagen`;
}
