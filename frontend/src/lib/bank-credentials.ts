import { fetchCachedJson } from "./fetch-cache";

export type StoredBankCredentials = {
  scope: string;
  bank_key: string;
  bank_name?: string;
  bank_logo?: string;
  blz?: string;
  account_name?: string;
  account_iban?: string;
  username?: string;
  accounts?: Array<{
    iban?: string;
    account_name?: string;
  }>;
};

export type BankCredentials = {
  bank_key: string;
  account_name?: string;
  account_iban?: string;
  username: string;
  pin: string;
  accounts?: Array<{
    iban?: string;
    account_name?: string;
  }>;
};

export type BankCredentialsStatus = {
  configured: boolean;
  scope?: string;
  bank_key?: string;
  bank_name?: string;
  bank_logo?: string;
  blz?: string;
  account_name?: string;
  account_iban?: string;
  username?: string;
  accounts?: StoredBankCredentials["accounts"];
};

export type AccountBalanceAdjustmentResult = {
  current_balance: number;
  target_balance: number;
  difference: number;
  received: number;
  inserted: number;
  ignored: number;
};

export type BankAccountDiscoveryResponse = {
  count: number;
  accounts: Array<{
    iban?: string;
    account_name?: string;
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
};

const DEFAULT_API_BASE_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8112/api";

function getApiBaseUrl(): string {
  return (import.meta as any).env.VITE_SERVER_URL ?? DEFAULT_API_BASE_URL;
}

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));

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

export async function fetchBankCredentialsStatus(): Promise<BankCredentialsStatus> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/status`);
  return parseJsonResponse(response);
}

export async function fetchBankCredentials(options?: {
  forceRefresh?: boolean;
}): Promise<StoredBankCredentials[]> {
  return fetchCachedJson({
    key: "bank-credentials",
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(`${getApiBaseUrl()}/bank-credentials`);
      const payload = await parseJsonResponse(response);
      return payload?.credentials ?? [];
    },
  });
}

export async function fetchAvailableBanks(options?: {
  forceRefresh?: boolean;
}): Promise<BankDefinition[]> {
  return fetchCachedJson({
    key: "available-banks",
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(`${getApiBaseUrl()}/bank-credentials/banks`);
      const payload = await parseJsonResponse(response);
      return payload?.banks ?? [];
    },
  });
}

export async function fetchBankAccounts(
  credentials: BankCredentials,
): Promise<BankAccountDiscoveryResponse> {
  const response = await fetch(`${getApiBaseUrl()}/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ credentials }),
  });

  return parseJsonResponse(response);
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
    window.dispatchEvent(
      new CustomEvent("finance-bank-credentials-changed", { detail: payload }),
    );
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
    window.dispatchEvent(
      new CustomEvent("finance-bank-credentials-changed", { detail: payload }),
    );
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
  payload: { account_name?: string; account_iban?: string },
): Promise<BankCredentialsStatus> {
  const response = await fetch(
    `${getApiBaseUrl()}/bank-credentials/${scope}/accounts/${encodeURIComponent(
      iban,
    )}`,
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

export async function deleteBankAccount(
  scope: string,
  iban: string,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/bank-credentials/${scope}/accounts/${encodeURIComponent(
      iban,
    )}`,
    {
      method: "DELETE",
    },
  );

  const payload = await parseJsonResponse(response);

  try {
    window.dispatchEvent(
      new CustomEvent("finance-bank-credentials-changed", { detail: payload }),
    );
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
    `${getApiBaseUrl()}/bank-credentials/${scope}/accounts/${encodeURIComponent(
      iban,
    )}/balance`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    },
  );

  const payload = await parseJsonResponse(response);

  try {
    window.dispatchEvent(
      new CustomEvent("finance-data-refresh", { detail: payload }),
    );
  } catch {
    // ignore if running in non-browser environment
  }

  return payload;
}
