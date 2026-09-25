export function formatIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

export function normalizeIban(value?: string | null): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  // Pseudo-IBANs (PAYPAL:…, ADYEN:…) sind keine echten IBANs, werden aber als
  // Referenzschlüssel für die Zahlungspartner-Zuordnung verwendet.
  if (normalized.includes(":")) return normalized;
  return normalized.length >= 15 ? normalized : "";
}

export function isUnknownIban(
  iban: string | null | undefined,
  knownIbans: ReadonlySet<string>,
): boolean {
  const normalized = normalizeIban(iban);
  return normalized.length > 0 && !knownIbans.has(normalized);
}
