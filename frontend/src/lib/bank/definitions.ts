export type BankDefinition = {
  key: string;
  name: string;
  blz: string;
  fints_url: string;
  bank_logo: string;
};

const DEFAULT_API_BASE_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8112/api";

function getApiBaseUrl(): string {
  return (import.meta as any).env.VITE_SERVER_URL ?? DEFAULT_API_BASE_URL;
}

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.detail?.message ??
        payload?.detail ??
        payload?.message ??
        "Bankdaten konnten nicht geladen werden",
    );
  }

  return payload;
}

export async function fetchAvailableBanks(): Promise<BankDefinition[]> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/banks`);
  const payload = await parseJsonResponse(response);
  return payload?.banks ?? [];
}
