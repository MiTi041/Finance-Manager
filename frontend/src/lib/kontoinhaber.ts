import { fetchCachedResource, getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

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

export async function fetchKontoinhaberReferenceData(options?: {
  forceRefresh?: boolean;
}): Promise<{
  count: number;
  kontoinhaber: KontoinhaberRecord[];
  iban_mappings: KontoinhaberMapping[];
}> {
  return fetchCachedResource(
    "kontoinhaber-reference-data",
    "/db/reference-data/kontoinhaber",
    (p) => ({
      count: p?.count ?? 0,
      kontoinhaber: p?.kontoinhaber ?? [],
      iban_mappings: p?.iban_mappings ?? [],
    }),
    options,
  );
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
