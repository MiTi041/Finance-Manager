import { getApiBaseUrl, parseJsonResponse } from "./api";

export type AccountFlowPoint = {
  x: number;
  y: number;
};

export type AccountFlowZone = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AccountFlowLayout = {
  positions: Record<string, AccountFlowPoint>;
  zones: AccountFlowZone[];
  notes: Record<string, string>;
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
