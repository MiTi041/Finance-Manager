import { fetchCachedResource, getApiBaseUrl, parseJsonResponse } from "./api";
import { getServerBaseUrl } from "./bank/zahlungspartner-logo";
import { emitReferenceChange } from "./events";

export type RecipientAccountRecord = {
  id: number;
  account_name: string;
  iban: string;
  bic?: string | null;
  recipient_name: string;
  is_donation_account: boolean;
  local_logo_path?: string | null;
};

export function resolveRecipientAccountLogoSrc(
  account: Pick<RecipientAccountRecord, "local_logo_path">,
): string | undefined {
  const path = (account.local_logo_path ?? "").trim();
  return path ? `${getServerBaseUrl()}${path}` : undefined;
}

export async function fetchRecipientAccountsReferenceData(options?: {
  forceRefresh?: boolean;
}): Promise<{
  count: number;
  recipient_accounts: RecipientAccountRecord[];
}> {
  return fetchCachedResource(
    "recipient-accounts-reference-data",
    "/db/reference-data/recipient-accounts",
    (p) => ({
      count: p?.count ?? 0,
      recipient_accounts: p?.recipient_accounts ?? [],
    }),
    options,
  );
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

export async function uploadRecipientAccountLogo(
  recipientAccountId: number,
  file: File,
): Promise<RecipientAccountRecord> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/recipient-accounts/${recipientAccountId}/logo`,
    {
      method: "POST",
      body: formData,
    },
  );

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteRecipientAccountLogo(
  recipientAccountId: number,
): Promise<RecipientAccountRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/reference-data/recipient-accounts/${recipientAccountId}/logo`,
    {
      method: "DELETE",
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