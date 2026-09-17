import { getApiBaseUrl, parseJsonResponse } from "./api";

export async function fetchLatestDbTransaction(iban?: string): Promise<any | null> {
  const url = new URL(`${getApiBaseUrl()}/db/transactions/latest`);
  if (iban) {
    url.searchParams.set("iban", iban);
  }

  const response = await fetch(url.toString());
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.detail ?? "Lokale Daten konnten nicht geladen werden");
  }

  return payload?.transaction ?? null;
}

export type ManualTransactionInput = {
  account_iban: string;
  date: string;
  amount: number;
  recipient_name?: string | null;
  recipient_iban?: string | null;
  purpose?: string | null;
  category?: number | null;
  note?: string | null;
};

export async function createManualTransaction(
  input: ManualTransactionInput,
): Promise<{ inserted: number }> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseJsonResponse(response);
}

export async function deleteTransaction(transactionId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/${transactionId}`, {
    method: "DELETE",
  });

  await parseJsonResponse(response);
}

export async function deleteTransactionsBatch(
  transactionIds: number[],
): Promise<{ deleted: number }> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/batch-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
  return parseJsonResponse(response);
}

export type TransactionAccountMigrationInput = {
  source_iban: string;
  target_iban: string;
  from_date?: string | null;
  to_date?: string | null;
  origin_bank_name?: string | null;
};

export type TransactionAccountMigrationResult = {
  batch_id: string;
  migrated: number;
  source_iban: string;
  target_iban: string;
  from_date: string | null;
  to_date: string | null;
};

export async function migrateTransactionsToAccount(
  input: TransactionAccountMigrationInput,
): Promise<TransactionAccountMigrationResult> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/migrate-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseJsonResponse(response);
}

export async function updateTransactionSplits(
  transactionId: number,
  splits: { betrag: number; kategorieId: number | null; name?: string | null }[] | null,
): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/${transactionId}/splits`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ splits }),
  });

  await parseJsonResponse(response);
}

export async function addRefundLink(
  transactionId: number,
  expenseTransactionId: number,
  amount: number,
): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/${transactionId}/refund-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expense_transaction_id: expenseTransactionId,
      amount,
    }),
  });

  await parseJsonResponse(response);
}

export async function deleteRefundLink(transactionId: number, linkId: number): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/refund-links/${linkId}`,
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
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/${transactionId}/note`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note }),
  });

  await parseJsonResponse(response);
}

export async function updateTransactionPurpose(
  transactionId: number,
  purposeEdit: string | null,
): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/${transactionId}/purpose`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purpose_edit: purposeEdit }),
  });

  await parseJsonResponse(response);
}
