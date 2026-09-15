export function normalizeIban(value?: string | null): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  // Pseudo-IBANs (PAYPAL:…, ADYEN:…) sind keine echten IBANs, werden aber als
  // Referenzschlüssel für die Zahlungspartner-Zuordnung verwendet.
  if (normalized.includes(":")) return normalized;
  return normalized.length >= 15 ? normalized : "";
}
