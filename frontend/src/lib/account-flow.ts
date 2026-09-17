import { getApiBaseUrl, parseJsonResponse } from "./api";

export type AccountFlowPoint = {
  x: number;
  y: number;
};

export type AccountFlowLayout = {
  positions: Record<string, AccountFlowPoint>;
};

export async function fetchAccountFlowLayout(): Promise<AccountFlowLayout> {
  const response = await fetch(`${getApiBaseUrl()}/account-flow/layout`);
  return parseJsonResponse(response);
}

export async function saveAccountFlowLayout(layout: AccountFlowLayout): Promise<AccountFlowLayout> {
  const response = await fetch(`${getApiBaseUrl()}/account-flow/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
  return parseJsonResponse(response);
}
