import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export type Budget = {
  id: number;
  category_id: number;
  name: string;
  icon: string | null;
  monthly_amount: number;
  spent: number;
  remaining: number;
  is_over: boolean;
};

export async function fetchBudgets(month: string): Promise<Budget[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets?month=${month}`);
  const data = await parseJsonResponse(response);
  return data.budgets ?? [];
}

export async function createBudget(category_id: number, monthly_amount: number): Promise<Budget> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id, monthly_amount }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function updateBudget(budgetId: number, monthly_amount: number): Promise<Budget> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/${budgetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_amount }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteBudget(budgetId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/${budgetId}`, {
    method: "DELETE",
  });
  await parseJsonResponse(response);
  await emitReferenceChange();
}
