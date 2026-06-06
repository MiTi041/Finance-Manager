import { getApiBaseUrl, parseJsonResponse } from "../api";
import { type Prediction } from "./types";

export async function triggerAutoCategorize(): Promise<{
  count: number;
  predictions: Prediction[];
}> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/auto-categorize`,
    { method: "POST" },
  );
  return parseJsonResponse(response);
}

export async function applyPrediction(
  transactionId: number,
  categoryId: number | null,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/auto-categorize/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: transactionId,
        category_id: categoryId,
      }),
    },
  );
  await parseJsonResponse(response);
}

export async function applyAllPredictions(
  items: Array<{ transaction_id: number; category_id: number | null }>,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/auto-categorize/apply-all`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    },
  );
  await parseJsonResponse(response);
}
