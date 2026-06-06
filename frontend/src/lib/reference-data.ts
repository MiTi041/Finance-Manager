import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

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
