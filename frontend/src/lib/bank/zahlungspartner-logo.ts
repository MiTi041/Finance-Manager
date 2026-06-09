import { getApiBaseUrl } from "@/lib/api";

function isRemoteLogoUrl(value: string) {
  return /^(https?:|data:)/i.test(value);
}

function isLocalFilePath(value: string) {
  return (
    value.startsWith("file://") ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes("/")
  );
}

export function getServerBaseUrl() {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

export function resolveZahlungspartnerLogoSrc(
  logoUrl?: string | null,
  zahlungspartnerId?: number,
  localLogoPath?: string | null,
): string | undefined {
  const localPath = (localLogoPath || "").trim();
  if (localPath) {
    if (localPath.startsWith("/assets/")) {
      return `${getServerBaseUrl()}${localPath}`;
    }
    return undefined;
  }

  const value = (logoUrl || "").trim();
  if (!value) return undefined;

  if (isRemoteLogoUrl(value)) {
    return value;
  }

  // If user already enters a server assets path, normalize it against server base.
  if (value.startsWith("/assets/")) {
    return `${getServerBaseUrl()}${value}`;
  }

  // If value references the client-side payment partner logos folder,
  // point to the server assets mount so the backend can serve them from
  // a single origin (recommended for production).
  const partnerLogosMatch = value.match(
    /payment-partner-logos[\\/]([^\\/]+)$/i,
  );
  if (partnerLogosMatch && partnerLogosMatch[1]) {
    return `${getServerBaseUrl()}/assets/images/payment-partner-logos/${partnerLogosMatch[1]}`;
  }

  // If it's some other local file path, and we have an id, use the
  // zahlungspartner logo endpoint which resolves stored local files.
  if (isLocalFilePath(value) && zahlungspartnerId) {
    return `${getApiBaseUrl()}/db/reference-data/zahlungspartner/${zahlungspartnerId}/logo`;
  }

  return value;
}
