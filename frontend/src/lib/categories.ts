import { fetchCachedJson } from "./fetch-cache";

const DEFAULT_API_BASE_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8112/api";

export type FinanceCategory = {
  id: number;
  name: string;
  typ: string;
  parent_id: number | null;
  parent_name?: string | null;
  personal_expense: boolean;
};

function getApiBaseUrl(): string {
  return (import.meta as any).env.VITE_SERVER_URL ?? DEFAULT_API_BASE_URL;
}

async function emitReferenceChange() {
  try {
    window.dispatchEvent(new CustomEvent("finance-reference-data-changed"));
  } catch {
    // ignore if running in non-browser environment
  }
}

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.detail?.message ??
        payload?.detail ??
        payload?.message ??
        "Kategorien konnten nicht geladen werden",
    );
  }

  return payload;
}

export async function fetchCategories(options?: {
  forceRefresh?: boolean;
}): Promise<FinanceCategory[]> {
  return fetchCachedJson({
    key: "categories",
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(`${getApiBaseUrl()}/db/categories`);
      const payload = await parseJsonResponse(response);
      return payload?.categories ?? [];
    },
  });
}

export async function createCategory(payload: {
  name: string;
  typ: string;
  parent_id?: number | null;
  personal_expense?: boolean;
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
