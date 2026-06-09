import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export async function fetchIbanZahlungspartnerReferences(): Promise<
  Array<{
    iban: string;
    f_zahlungspartner_id: number;
    zahlungspartner_name: string;
    zahlungspartner_website?: string | null;
    zahlungspartner_logo_padding?: boolean | null;
    zahlungspartner_logo_url?: string | null;
    zahlungspartner_logo_white_background?: boolean | null;
    zahlungspartner_is_company?: boolean | null;
    resolved_logo_url?: string | null;
  }>
> {
  const response = await fetch(`${getApiBaseUrl()}/db/reference-data/ibans`);
  const payload = await parseJsonResponse(response);

  return payload?.references ?? [];
}

export async function updateIbanZahlungspartnerMapping(
  iban: string,
  zahlungspartnerId: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/ibans/${encodeURIComponent(iban)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ zahlungspartner_id: zahlungspartnerId }),
    },
  );

  await parseJsonResponse(response);
  await emitReferenceChange();
}
