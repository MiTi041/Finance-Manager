import { fetchCachedJson } from "./fetch-cache";

const DEFAULT_API_BASE_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8112/api";

export type KontoinhaberRecord = {
  id: number;
  name: string;
  website?: string | null;
  logo_url?: string | null;
  local_logo_path?: string | null;
  logo_white_background?: boolean;
  logo_padding?: boolean;
  is_company: boolean;
  ibans: string[];
};

export type KontoinhaberMapping = {
  iban: string;
  f_kontoinhaber_id: number;
  kontoinhaber_name: string;
  kontoinhaber_website?: string | null;
  kontoinhaber_logo_url?: string | null;
  kontoinhaber_local_logo_path?: string | null;
  kontoinhaber_logo_white_background?: boolean | null;
  kontoinhaber_logo_padding?: boolean | null;
  kontoinhaber_is_company?: boolean | null;
};

export type RecipientAccountRecord = {
  id: number;
  account_name: string;
  iban: string;
  bic?: string | null;
  recipient_name: string;
  is_donation_account: boolean;
};

export function getApiBaseUrl(): string {
  return (import.meta as any).env.VITE_SERVER_URL ?? DEFAULT_API_BASE_URL;
}

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.detail?.message ??
        payload?.detail ??
        payload?.message ??
        "Lokale Daten konnten nicht geladen werden",
    );
  }

  return payload;
}

export async function uploadToDbTransactions(
  rows: any[],
  chunkSize = 500,
  onProgress: (percent: number) => void,
) {
  const total = rows.length;

  if (total === 0) {
    onProgress(100);
    return;
  }

  for (let index = 0; index < total; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const response = await fetch(`${getApiBaseUrl()}/db/transactions/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rows: chunk }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload?.detail ?? "Lokale Datenbank konnte nicht aktualisiert werden",
      );
    }

    const percent = Math.min(
      100,
      Math.round(((index + chunk.length) / total) * 100),
    );
    onProgress(percent);
  }
}

export async function fetchLatestDbTransaction(
  iban?: string,
): Promise<any | null> {
  const url = new URL(`${getApiBaseUrl()}/db/transactions/latest`);
  if (iban) {
    url.searchParams.set("iban", iban);
  }

  const response = await fetch(url.toString());
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.detail ?? "Lokale Daten konnten nicht geladen werden",
    );
  }

  return payload?.transaction ?? null;
}

export async function fetchIbanKontoinhaberReferences(): Promise<
  Array<{
    iban: string;
    f_kontoinhaber_id: number;
    kontoinhaber_name: string;
    kontoinhaber_website?: string | null;
    kontoinhaber_logo_padding?: boolean | null;
    kontoinhaber_logo_url?: string | null;
    kontoinhaber_logo_white_background?: boolean | null;
    kontoinhaber_is_company?: boolean | null;
    resolved_logo_url?: string | null;
  }>
> {
  const response = await fetch(`${getApiBaseUrl()}/db/reference-data/ibans`);
  const payload = await parseJsonResponse(response);

  return payload?.references ?? [];
}

export async function fetchKontoinhaberReferenceData(options?: {
  forceRefresh?: boolean;
}): Promise<{
  count: number;
  kontoinhaber: KontoinhaberRecord[];
  iban_mappings: KontoinhaberMapping[];
}> {
  return fetchCachedJson({
    key: "kontoinhaber-reference-data",
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(
        `${getApiBaseUrl()}/db/reference-data/kontoinhaber`,
      );
      const payload = await parseJsonResponse(response);
      return {
        count: payload?.count ?? 0,
        kontoinhaber: payload?.kontoinhaber ?? [],
        iban_mappings: payload?.iban_mappings ?? [],
      };
    },
  });
}

export async function fetchRecipientAccountsReferenceData(options?: {
  forceRefresh?: boolean;
}): Promise<{
  count: number;
  recipient_accounts: RecipientAccountRecord[];
}> {
  return fetchCachedJson({
    key: "recipient-accounts-reference-data",
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(
        `${getApiBaseUrl()}/db/reference-data/recipient-accounts`,
      );
      const payload = await parseJsonResponse(response);
      return {
        count: payload?.count ?? 0,
        recipient_accounts: payload?.recipient_accounts ?? [],
      };
    },
  });
}

async function emitReferenceChange() {
  try {
    window.dispatchEvent(new CustomEvent("finance-reference-data-changed"));
  } catch {
    // ignore if running in non-browser environment
  }
}

export async function createKontoinhaber(payload: {
  name: string;
  website?: string | null;
  logo_url?: string | null;
  logo_white_background?: boolean;
  logo_padding?: boolean;
  is_company: boolean;
}): Promise<KontoinhaberRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/kontoinhaber`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function fetchKontoinhaber(
  kontoinhaberId: number,
): Promise<KontoinhaberRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${kontoinhaberId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const result = await parseJsonResponse(response);
  return result;
}

export async function updateKontoinhaber(
  kontoinhaberId: number,
  payload: Partial<{
    name: string;
    website: string | null;
    logo_url: string | null;
    local_logo_path: string | null;
    logo_white_background: boolean;
    logo_padding: boolean;
    is_company: boolean;
  }>,
): Promise<KontoinhaberRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${kontoinhaberId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function uploadKontoinhaberLocalLogo(
  kontoinhaberId: number,
  file: File,
): Promise<KontoinhaberRecord> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Bilddatei konnte nicht gelesen werden"));
      }
    });
    reader.addEventListener("error", () => {
      reject(new Error("Bilddatei konnte nicht gelesen werden"));
    });
    reader.readAsDataURL(file);
  });

  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${kontoinhaberId}/local-logo`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content_type: file.type,
        data,
      }),
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteKontoinhaberLocalLogo(
  kontoinhaberId: number,
): Promise<KontoinhaberRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${kontoinhaberId}/local-logo`,
    {
      method: "DELETE",
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteKontoinhaber(
  kontoinhaberId: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${kontoinhaberId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
  await emitReferenceChange();
}

export async function createRecipientAccount(payload: {
  account_name: string;
  iban: string;
  bic?: string | null;
  recipient_name: string;
  is_donation_account?: boolean;
}): Promise<RecipientAccountRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/recipient-accounts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function updateRecipientAccount(
  recipientAccountId: number,
  payload: Partial<{
    account_name: string;
    iban: string;
    bic: string | null;
    recipient_name: string;
    is_donation_account: boolean;
  }>,
): Promise<RecipientAccountRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/recipient-accounts/${recipientAccountId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteRecipientAccount(
  recipientAccountId: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/recipient-accounts/${recipientAccountId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
  await emitReferenceChange();
}

export async function updateIbanKontoinhaberMapping(
  iban: string,
  kontoinhaberId: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/ibans/${encodeURIComponent(iban)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kontoinhaber_id: kontoinhaberId }),
    },
  );

  await parseJsonResponse(response);
  await emitReferenceChange();
}

export async function deleteTransaction(transactionId: number): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
}

export async function updateTransactionNote(
  transactionId: number,
  note: string | null,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/note`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    },
  );

  await parseJsonResponse(response);
}
