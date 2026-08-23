import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export type BudgetPeriod = "monthly" | "yearly";

export type Budget = {
  id: number;
  category_ids: number[];
  hashtags: string[];
  name: string;
  categories: { name: string; icon: string | null }[];
  amount: number;
  period: BudgetPeriod;
  spent: number;
  remaining: number;
  is_over: boolean;
};

export async function fetchBudgets(month: string): Promise<Budget[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets?month=${month}`);
  const data = await parseJsonResponse(response);
  return data.budgets ?? [];
}

export async function fetchHashtagSuggestions(): Promise<string[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/hashtag-suggestions`);
  const data = await parseJsonResponse(response);
  return data.hashtags ?? [];
}

type BudgetStub = Pick<Budget, "id" | "name" | "category_ids" | "hashtags" | "amount" | "period">;

export async function createBudget(
  name: string,
  category_ids: number[],
  amount: number,
  period: BudgetPeriod = "monthly",
  hashtags: string[] = [],
): Promise<BudgetStub> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category_ids, hashtags, amount, period }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function updateBudget(
  budgetId: number,
  name: string,
  category_ids: number[],
  amount: number,
  period: BudgetPeriod,
  hashtags: string[] = [],
): Promise<BudgetStub> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/${budgetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category_ids, hashtags, amount, period }),
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
