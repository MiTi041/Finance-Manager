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

export type ManualTransactionUpdateInput = Omit<ManualTransactionInput, "account_iban">;

export async function updateManualTransaction(
  transactionId: number,
  input: ManualTransactionUpdateInput,
): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/${transactionId}/manual`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  await parseJsonResponse(response);
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

export type CsvSchemaInfo = { key: string; label: string; columns: string[] };

export async function fetchCsvSchemas(): Promise<CsvSchemaInfo[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/csv-schemas`);
  const payload = await parseJsonResponse(response);
  return payload?.schemas ?? [];
}

export type CsvPreviewRow = {
  date: string | null;
  amount: number | null;
  recipient_name: string | null;
  recipient_iban: string | null;
  purpose: string | null;
  category: number | null;
  category_text: string | null;
  note: string | null;
  transaction_id: string | null;
  status: "ok" | "duplicate" | "invalid";
  error: string | null;
};

export type CsvPreviewResult = {
  rows: CsvPreviewRow[];
  counts: { total: number; ok: number; duplicate: number; invalid: number };
};

export async function previewCsvImport(
  accountIban: string,
  schemaKey: string,
  file: File,
): Promise<CsvPreviewResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("schema_key", schemaKey);
  form.append("account_iban", accountIban);
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/csv-preview`, {
    method: "POST",
    body: form,
  });
  return parseJsonResponse(response);
}

export async function importCsvTransactions(
  accountIban: string,
  rows: CsvPreviewRow[],
): Promise<{ received: number; inserted: number; ignored: number }> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions/csv-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_iban: accountIban, rows }),
  });
  return parseJsonResponse(response);
}
