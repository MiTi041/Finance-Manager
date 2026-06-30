import { getApiBaseUrl, parseJsonResponse } from "./api";

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

export async function deleteTransaction(transactionId: number): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
}

export async function deleteTransactionsBatch(
  transactionIds: number[],
): Promise<{ deleted: number }> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/batch-delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_ids: transactionIds }),
    },
  );
  return parseJsonResponse(response);
}

export async function updateTransactionSplits(
  transactionId: number,
  splits: { betrag: number; kategorieId: number | null; name?: string | null }[] | null,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/splits`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ splits }),
    },
  );

  await parseJsonResponse(response);
}

export async function updateRefundLink(
  transactionId: number,
  refundRefTransactionId: number | null,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/refund-link`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refund_ref_transaction_id: refundRefTransactionId }),
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
