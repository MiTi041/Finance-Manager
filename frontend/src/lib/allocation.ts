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
};

export type AllocationStatus = {
  month: string;
  net_income: number;
  total_allocated: number;
  remaining: number;
  status: string;
  buckets: AllocationRunBucket[];
  config: AllocationBucket[];
};

export type BafoegConfig = {
  total_debt: number;
  monthly_rate: number;
  interest_rate: number;
  payout_date: string | null;
};

export type AllocationSettings = {
  bafoeg_enabled: boolean;
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
  payload: Partial<Pick<AllocationBucket, "percentage" | "recipient_account_id" | "sender_iban" | "is_active">>,
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

export async function fetchAllocationSettings(): Promise<AllocationSettings> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/settings`);
  return parseJsonResponse(response);
}

export async function updateAllocationSettings(payload: Partial<AllocationSettings>): Promise<AllocationSettings> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function executeTransfer(
  runBucketId: number,
  tan?: string,
): Promise<{ status: string; transfer: unknown }> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/transfer/${runBucketId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tan ? { tan } : {}),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function recalculateRun(month?: string): Promise<AllocationStatus> {
  const params = month ? `?month=${month}` : "";
  const response = await fetch(`${getApiBaseUrl()}/allocation/run${params}`, {
    method: "POST",
  });
  return parseJsonResponse(response);
}

export async function fetchAllocationHistory(): Promise<{ id: number; month: string; net_income: number; status: string; buckets: AllocationRunBucket[] }[]> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/history`);
  const data = await parseJsonResponse(response);
  return data.history ?? [];
}
