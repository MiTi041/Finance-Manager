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

export type AccountFlowIncomeSource = {
  name: string;
  purpose: string;
  amount: number;
  count: number;
  accountIban: string;
  applicantIban: string;
};

export async function fetchAccountFlowIncomeSources(
  month?: string,
): Promise<AccountFlowIncomeSource[]> {
  const params = month ? `?month=${month}` : "";
  const response = await fetch(`${getApiBaseUrl()}/account-flow/income-sources${params}`);
  const data = await parseJsonResponse(response);
  return (data.sources ?? []).map(
    (source: {
      name: string;
      purpose: string;
      amount: number;
      count: number;
      account_iban?: string;
      applicant_iban?: string;
    }) => ({
      name: source.name,
      purpose: source.purpose,
      amount: source.amount,
      count: source.count,
      accountIban: source.account_iban ?? "",
      applicantIban: source.applicant_iban ?? "",
    }),
  );
}

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
