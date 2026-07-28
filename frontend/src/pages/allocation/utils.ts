export function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parts = value.split("T")[0].split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(d.getTime()) ? undefined : d;
}

export function formatDateDisplay(date: Date | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("de-DE");
}

export function formatDateInputValue(date: Date | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
