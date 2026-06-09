import { fetchCachedResource, getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export type ZahlungspartnerRecord = {
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

export type ZahlungspartnerMapping = {
  iban: string;
  f_zahlungspartner_id: number;
  zahlungspartner_name: string;
  zahlungspartner_website?: string | null;
  zahlungspartner_logo_url?: string | null;
  zahlungspartner_local_logo_path?: string | null;
  zahlungspartner_logo_white_background?: boolean | null;
  zahlungspartner_logo_padding?: boolean | null;
  zahlungspartner_is_company?: boolean | null;
};

export async function fetchZahlungspartnerReferenceData(options?: {
  forceRefresh?: boolean;
}): Promise<{
  count: number;
  zahlungspartner: ZahlungspartnerRecord[];
  iban_mappings: ZahlungspartnerMapping[];
}> {
  return fetchCachedResource(
    "zahlungspartner-reference-data",
    "/db/reference-data/zahlungspartner",
    (p) => ({
      count: p?.count ?? 0,
      zahlungspartner: p?.zahlungspartner ?? [],
      iban_mappings: p?.iban_mappings ?? [],
    }),
    options,
  );
}

export async function createZahlungspartner(payload: {
  name: string;
  website?: string | null;
  logo_url?: string | null;
  logo_white_background?: boolean;
  logo_padding?: boolean;
  is_company: boolean;
}): Promise<ZahlungspartnerRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/zahlungspartner`,
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

export async function fetchZahlungspartner(
  zahlungspartnerId: number,
): Promise<ZahlungspartnerRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/zahlungspartner/${zahlungspartnerId}`,
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

export async function updateZahlungspartner(
  zahlungspartnerId: number,
  payload: Partial<{
    name: string;
    website: string | null;
    logo_url: string | null;
    local_logo_path: string | null;
    logo_white_background: boolean;
    logo_padding: boolean;
    is_company: boolean;
  }>,
): Promise<ZahlungspartnerRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/zahlungspartner/${zahlungspartnerId}`,
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

export async function uploadZahlungspartnerLocalLogo(
  zahlungspartnerId: number,
  file: File,
): Promise<ZahlungspartnerRecord> {
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
    `${getApiBaseUrl()}/db/reference-data/zahlungspartner/${zahlungspartnerId}/local-logo`,
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

export async function deleteZahlungspartnerLocalLogo(
  zahlungspartnerId: number,
): Promise<ZahlungspartnerRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/zahlungspartner/${zahlungspartnerId}/local-logo`,
    {
      method: "DELETE",
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteZahlungspartner(
  zahlungspartnerId: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/zahlungspartner/${zahlungspartnerId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
  await emitReferenceChange();
}
