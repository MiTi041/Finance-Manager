import { getApiBaseUrl, parseJsonResponse } from "./api";

export type LiquidityKind = "income" | "expense";
export type LiquidityCertainty = "certain" | "expected";

export type LiquidityEntry = {
  id: number;
  label: string;
  amount: number;
  kind: LiquidityKind;
  certainty: LiquidityCertainty;
  created_at?: string;
  updated_at?: string;
};

export type LiquidityEntryInput = {
  label: string;
  amount: number;
  kind: LiquidityKind;
  certainty: LiquidityCertainty;
};

export type PendingTransactionDto = {
  amount: number;
  date: string | null;
  entry_date?: string | null;
  purpose?: string | null;
  recipient_name?: string | null;
  applicant_name?: string | null;
};

export async function fetchLiquidityEntries(): Promise<LiquidityEntry[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries`);
  const data = await parseJsonResponse(response);
  return data.entries ?? [];
}

export async function createLiquidityEntry(input: LiquidityEntryInput): Promise<LiquidityEntry> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse(response);
}

export async function updateLiquidityEntry(
  id: number,
  input: LiquidityEntryInput,
): Promise<LiquidityEntry> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse(response);
}

export async function deleteLiquidityEntry(id: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries/${id}`, {
    method: "DELETE",
  });
  await parseJsonResponse(response);
}

type AccountBalanceDto = { account_iban: string; balance: number };

export async function fetchBalanceTotal(): Promise<number> {
  const response = await fetch(`${getApiBaseUrl()}/db/account-balances?days=36500`);
  const data = await parseJsonResponse(response);
  const balances: AccountBalanceDto[] = Array.isArray(data) ? data : (data.balances ?? []);
  return balances.reduce((sum, balance) => sum + Number(balance.balance ?? 0), 0);
}

export async function fetchPendingTransactions(): Promise<PendingTransactionDto[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions?days=1`);
  const data = await parseJsonResponse(response);
  return Array.isArray(data?.pending) ? data.pending : [];
}
