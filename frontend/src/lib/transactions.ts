import { getApiBaseUrl, parseJsonResponse } from "./api";

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
