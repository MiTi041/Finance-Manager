import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export type AllocationBucket = {
  id: number;
  bucket_type: "bafoeg" | "emergency" | "invest" | "donation" | "spending";
  percentage: number;
  recipient_account_id: number | null;
  sender_iban: string | null;
  is_active: boolean;
  sort_order: number;
  target_amount?: number | null;
  target_months?: number | null;
};

export type AllocationRunBucket = {
  id: number;
  run_id: number;
  bucket_id: number;
  bucket_type: string;
  target_amount: number;
  transferred: number;
  transferred_at: string | null;
  is_completed: boolean;
  spent?: number;
  available?: number;
  saved_total?: number;
  saved_einzahlungen?: number;
  saved_entnahmen?: number;
  saved_profit?: number;
  saved_tilgungen?: number;
  month_einzahlungen?: number;
  goal_amount?: number;
  months_left?: number;
  interest_rate?: number;
  payout_date?: string | null;
  required_monthly_rate?: number;
  income_events_left?: number;
};

export type SavingsPlan = {
  id: number;
  name: string;
  tag: string | null;
  target_amount: number | null;
  target_date: string | null;
  target_recipient_name: string | null;
  target_recipient_iban: string | null;
  target_recipient_bic: string | null;
  sender_iban: string | null;
  is_visible: boolean;
  monthly_rate: number;
  saved_amount: number;
  this_month: number;
  required_monthly_rate: number | null;
  income_events_left: number | null;
  saved_einzahlungen: number;
  saved_entnahmen: number;
  month_einzahlungen: number;
  month_entnahmen: number;
};

export type AllocationStatus = {
  month: string;
  net_income: number;
  total_allocated: number;
  remaining: number;
  status: string;
  buckets: AllocationRunBucket[];
  config: AllocationBucket[];
  savings_total: number;
  savings_plans: SavingsPlan[];
  auto_hidden_plan_ids: number[];
};

export async function fetchAllocationStatus(month?: string): Promise<AllocationStatus> {
  const params = month ? `?month=${month}` : "";
  const response = await fetch(`${getApiBaseUrl()}/allocation/status${params}`);
  return parseJsonResponse(response);
}

export async function fetchAllocationBuckets(): Promise<AllocationBucket[]> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/buckets`);
  const data = await parseJsonResponse(response);
  return data.buckets ?? [];
}

export async function updateAllocationBucket(
  bucketId: number,
  payload: Partial<Pick<AllocationBucket, "percentage" | "recipient_account_id" | "sender_iban" | "is_active" | "target_amount" | "target_months">>,
): Promise<AllocationBucket> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/buckets/${bucketId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export class TanRequiredError extends Error {
  challenge: string | null;
  decoupled: boolean;

  constructor(challenge: string | null, decoupled: boolean) {
    super(challenge || "TAN erforderlich");
    this.challenge = challenge;
    this.decoupled = decoupled;
  }
}

export async function executeTransfer(
  runBucketId: number,
  tan?: string,
  amount?: number,
): Promise<{ status: string; transfer: unknown }> {
  const body: Record<string, unknown> = {};
  if (tan) body.tan = tan;
  if (amount != null) body.amount = amount;
  const response = await fetch(`${getApiBaseUrl()}/allocation/transfer/${runBucketId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || {};
    if (detail?.code === "TAN_REQUIRED") {
      throw new TanRequiredError(detail.challenge, detail.decoupled);
    }
  }

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function recalculateRun(month?: string, force?: boolean): Promise<AllocationStatus> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (force) params.set("force", "true");
  const qs = params.toString();
  const response = await fetch(`${getApiBaseUrl()}/allocation/run${qs ? `?${qs}` : ""}`, {
    method: "POST",
  });
  return parseJsonResponse(response);
}

export async function fetchAllocationHistory(): Promise<{ id: number; month: string; net_income: number; status: string; buckets: AllocationRunBucket[] }[]> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/history`);
  const data = await parseJsonResponse(response);
  return data.history ?? [];
}

export type DonationAnalyticsAccount = {
  account_name: string;
  recipient_name: string;
  iban: string;
  total: number;
  count: number;
  logo_url: string | null;
  logo_white_background: boolean;
  logo_padding: boolean;
};

export type DonationAnalytics = {
  accounts: DonationAnalyticsAccount[];
  others: { total: number; count: number } | null;
  total: number;
};

export type BafoegConfig = {
  id?: number;
  total_debt: number;
  monthly_rate: number;
  interest_rate: number;
  current_balance: number;
  payout_date: string | null;
};

export type BafoegRateResponse = {
  required_monthly_rate: number;
  projected_end_balance: number;
  interest_earned: number;
};

export async function fetchBafoegConfig(): Promise<BafoegConfig> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/bafoeg-config`);
  return parseJsonResponse(response);
}

export async function updateBafoegConfig(payload: Partial<BafoegConfig>): Promise<BafoegConfig> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/bafoeg-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function berechneBafoegRate(payload: {
  current_balance: number;
  total_debt?: number;
  interest_rate?: number;
  payout_date: string;
  offene_zinsen?: number;
}): Promise<BafoegRateResponse> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/bafoeg/berechne-rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function fetchDonationAnalytics(): Promise<DonationAnalytics> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/donation-analytics`);
  return parseJsonResponse(response);
}

export async function fetchSavingsPlans(): Promise<SavingsPlan[]> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/savings-plans`);
  const data = await parseJsonResponse(response);
  return data.plans ?? [];
}

export async function createSavingsPlan(payload: {
  name: string;
  tag?: string | null;
  target_amount: number;
  target_date: string;
  target_recipient_name?: string | null;
  target_recipient_iban?: string | null;
  target_recipient_bic?: string | null;
  sender_iban?: string | null;
}): Promise<SavingsPlan> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/savings-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function updateSavingsPlan(planId: number, payload: Partial<Pick<SavingsPlan, "name" | "tag" | "target_amount" | "target_date" | "target_recipient_name" | "target_recipient_iban" | "target_recipient_bic" | "sender_iban" | "is_visible">>): Promise<SavingsPlan> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/savings-plans/${planId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function deleteSavingsPlan(planId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/savings-plans/${planId}`, {
    method: "DELETE",
  });
  await parseJsonResponse(response);
}

export async function executeSavingsPlanTransfer(
  planId: number,
  tan?: string,
  amount?: number,
): Promise<{ status: string; transfer: unknown }> {
  const body: Record<string, unknown> = {};
  if (tan) body.tan = tan;
  if (amount != null) body.amount = amount;
  const response = await fetch(`${getApiBaseUrl()}/allocation/savings-plans/${planId}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || {};
    if (detail?.code === "TAN_REQUIRED") {
      throw new TanRequiredError(detail.challenge, detail.decoupled);
    }
  }

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}
