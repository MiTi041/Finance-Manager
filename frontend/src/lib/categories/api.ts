import { fetchCachedResource, getApiBaseUrl, parseJsonResponse } from "../api";
import { emitReferenceChange } from "../events";
import { type FinanceCategory } from "./types";

export async function fetchCategories(options?: {
  forceRefresh?: boolean;
}): Promise<FinanceCategory[]> {
  return fetchCachedResource("categories-v2", "/db/categories", (p) => p?.categories ?? [], options);
}

export async function createCategory(payload: {
  name: string;
  typ: string;
  parent_id?: number | null;
  personal_expense?: boolean;
  icon?: string | null;
}): Promise<FinanceCategory> {
  const response = await fetch(`${getApiBaseUrl()}/db/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function updateCategory(
  categoryId: number,
  payload: Partial<{
    name: string;
    typ: string;
    parent_id: number | null;
    personal_expense: boolean;
    icon: string | null;
  }>,
): Promise<FinanceCategory> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/categories/${categoryId}`,
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

export async function deleteCategory(categoryId: number): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/categories/${categoryId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
  await emitReferenceChange();
}
