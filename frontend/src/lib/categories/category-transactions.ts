import { getApiBaseUrl, parseJsonResponse } from "../api";

export async function updateTransactionCategory(
  transactionId: number,
  categoryId: number | null,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/category`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ category_id: categoryId }),
    },
  );

  await parseJsonResponse(response);
}

export async function updateTransactionsCategoryBatch(
  transactionIds: number[],
  categoryId: number | null,
): Promise<{ updated: number }> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/batch-categorize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transaction_ids: transactionIds, category_id: categoryId }),
    },
  );

  return parseJsonResponse(response);
}
