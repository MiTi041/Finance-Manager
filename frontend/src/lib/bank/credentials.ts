import { clearCachedJson } from "../fetch-cache";
import { fetchCachedResource, getApiBaseUrl, parseJsonResponse } from "../api";
import { RateLimitError } from "../upload-helper";

export type StoredBankCredentials = {
  scope: string;
  bank_key: string;
  bank_name?: string;
  bank_logo?: string;
  bank_logo_dark?: string;
  logo_padding?: number;
  blz?: string;
  manual?: boolean;
  account_name?: string;
  account_iban?: string;
  username?: string;
  tan_medium?: string;
  auto_sync?: boolean;
  accounts?: Array<{
    iban?: string;
    account_name?: string;
    holder_name?: string | null;
    bank_key?: string | null;
    sender_iban?: string | null;
    bank_name?: string | null;
    bank_logo?: string | null;
    bank_logo_dark?: string | null;
    balance?: number | null;
    archived?: boolean;
    migrated_to_iban?: string | null;
    can_transfer?: boolean | null;
    can_transfer_detected?: boolean | null;
    can_transfer_override?: boolean | null;
  }>;
};

export type BankCredentials = {
  bank_key: string;
  account_name?: string;
  account_iban?: string;
  username?: string;
  pin?: string;
  tan_medium?: string;
  auto_sync?: boolean;
  accounts?: Array<{
    iban?: string;
    account_name?: string;
    holder_name?: string | null;
    bank_key?: string | null;
    sender_iban?: string | null;
    archived?: boolean;
    can_transfer?: boolean | null;
    can_transfer_detected?: boolean | null;
    can_transfer_override?: boolean | null;
  }>;
};

export type BankCredentialsStatus = {
  configured: boolean;
  scope?: string;
  bank_key?: string;
  bank_name?: string;
  bank_logo?: string;
  bank_logo_dark?: string;
  logo_padding?: number;
  blz?: string;
  manual?: boolean;
  account_name?: string;
  account_iban?: string;
  username?: string;
  accounts?: StoredBankCredentials["accounts"];
};

export type AccountBalanceAdjustmentResult = {
  correction: number;
  bank_balance: number;
};

export class TanRequiredError extends Error {
  constructor(
    public readonly challenge: string | null,
    public readonly decoupled: boolean,
  ) {
    super(
      decoupled
        ? "Bitte bestätige die Verbindung in deiner Banking-App."
        : "TAN erforderlich für die Verbindung.",
    );
    this.name = "TanRequiredError";
  }
}

export type BankAccountDiscoveryResponse = {
  count: number;
  accounts: Array<{
    iban?: string;
    account_name?: string;
    product_name?: string;
    holder_name?: string | null;
    archived?: boolean;
    can_transfer?: boolean | null;
    iban_label?: string;
    bank_name?: string;
  }>;
};

export type BankDefinition = {
  key: string;
  name: string;
  blz: string;
  fints_url: string;
  bank_logo: string;
  bank_logo_dark: string;
  can_transfer: boolean;
  needs_tan_medium_name?: boolean;
  username_hint?: string | null;
};

export async function fetchBankCredentialsStatus(): Promise<BankCredentialsStatus> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/status`);
  return parseJsonResponse(response);
}

export async function fetchBankCredentials(options?: {
  forceRefresh?: boolean;
}): Promise<StoredBankCredentials[]> {
  return fetchCachedResource(
    "bank-credentials",
    "/bank-credentials",
    (p) => p?.credentials ?? [],
    options,
  );
}

export async function fetchAvailableBanks(options?: {
  forceRefresh?: boolean;
}): Promise<BankDefinition[]> {
  return fetchCachedResource(
    "available-banks",
    "/bank-credentials/banks",
    (p) => p?.banks ?? [],
    options,
  );
}

export async function fetchBankAccounts(
  credentials: BankCredentials,
  tan?: string,
): Promise<BankAccountDiscoveryResponse> {
  const response = await fetch(`${getApiBaseUrl()}/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ credentials, tan }),
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 409 && payload?.detail?.code === "TAN_REQUIRED") {
    throw new TanRequiredError(payload.detail.challenge, payload.detail.decoupled ?? false);
  }

  if (response.status === 429 && payload?.code === "RATE_LIMITED") {
    throw new RateLimitError(payload.retry_after, payload.code);
  }

  if (!response.ok) {
    throw new Error(
      payload?.detail?.message ??
        payload?.detail ??
        payload?.message ??
        "Bankdaten konnten nicht geladen werden",
    );
  }

  return payload;
}

export async function saveBankCredentials(
  credentials: BankCredentials,
): Promise<BankCredentialsStatus> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  const payload = await parseJsonResponse(response);

  try {
    clearCachedJson("bank-credentials");
    window.dispatchEvent(new CustomEvent("finance-bank-credentials-changed", { detail: payload }));
  } catch {
    // ignore if running in non-browser environment
  }

  return payload;
}

export async function deleteBankCredentials(scope?: string): Promise<void> {
  const url = new URL(`${getApiBaseUrl()}/bank-credentials`);
  if (scope) {
    url.searchParams.set("scope", scope);
  }

  const response = await fetch(url.toString(), {
    method: "DELETE",
  });

  const payload = await parseJsonResponse(response);

  try {
    clearCachedJson("bank-credentials");
    window.dispatchEvent(new CustomEvent("finance-bank-credentials-changed", { detail: payload }));
  } catch {
    // ignore if running in non-browser environment
  }
}

export async function updateBankCredentials(
  scope: string,
  payload: Partial<StoredBankCredentials>,
): Promise<BankCredentialsStatus> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/${scope}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const payloadData = await parseJsonResponse(response);

  try {
    clearCachedJson("bank-credentials");
    window.dispatchEvent(
      new CustomEvent("finance-bank-credentials-changed", {
        detail: payloadData,
      }),
    );
  } catch {
    // ignore if running in non-browser environment
  }

  return payloadData;
}

export async function updateBankAccount(
  scope: string,
  iban: string,
  payload: {
    account_name?: string;
    account_iban?: string;
    holder_name?: string;
    sender_iban?: string;
    archived?: boolean;
    can_transfer_override?: boolean | null;
  },
): Promise<BankCredentialsStatus> {
  const response = await fetch(
    `${getApiBaseUrl()}/bank-credentials/${scope}/accounts/${encodeURIComponent(iban)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const payloadData = await parseJsonResponse(response);

  try {
    clearCachedJson("bank-credentials");
    window.dispatchEvent(
      new CustomEvent("finance-bank-credentials-changed", {
        detail: payloadData,
      }),
    );
  } catch {
    // ignore if running in non-browser environment
  }

  return payloadData;
}

export async function deleteBankAccount(scope: string, iban: string): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/bank-credentials/${scope}/accounts/${encodeURIComponent(iban)}`,
    {
      method: "DELETE",
    },
  );

  const payload = await parseJsonResponse(response);

  try {
    clearCachedJson("bank-credentials");
    window.dispatchEvent(new CustomEvent("finance-bank-credentials-changed", { detail: payload }));
  } catch {
    // ignore if running in non-browser environment
  }
}

export async function adjustBankAccountBalance(
  scope: string,
  iban: string,
  note?: string,
): Promise<AccountBalanceAdjustmentResult> {
  const response = await fetch(
    `${getApiBaseUrl()}/bank-credentials/${scope}/accounts/${encodeURIComponent(iban)}/balance`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    },
  );

  if (response.status === 429) {
    const payload = await response.json().catch(() => ({}));
    const retryAfter = payload?.retry_after ?? payload?.detail?.retry_after ?? 60;
    throw new Error(`Saldo-Abruf limitiert. Bitte warte ${retryAfter} Sekunden.`);
  }

  const payload = await parseJsonResponse(response);

  try {
    clearCachedJson("bank-credentials");
    window.dispatchEvent(new CustomEvent("finance-bank-credentials-changed", { detail: payload }));
  } catch {
    // ignore if running in non-browser environment
  }

  return payload;
}
