import { clearCachedJson } from "../fetch-cache";
import { fetchCachedResource, getApiBaseUrl, parseJsonResponse } from "../api";

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
    balance?: number | null;
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

export async function fetchBankCredentialsStatus(): Promise<BankCredentialsStatus> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/status`);
  return parseJsonResponse(response);
}

export async function fetchBankCredentials(options?: {
  forceRefresh?: boolean;
}): Promise<StoredBankCredentials[]> {
  return fetchCachedResource("bank-credentials", "/bank-credentials", (p) => p?.credentials ?? [], options);
}

export async function fetchAvailableBanks(options?: {
  forceRefresh?: boolean;
}): Promise<BankDefinition[]> {
  return fetchCachedResource("available-banks", "/bank-credentials/banks", (p) => p?.banks ?? [], options);
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

  const payload = await response.json().catch(() => ({}));

  if (response.status === 409 && payload?.detail?.code === "TAN_REQUIRED") {
    throw new TanRequiredError(
      payload.detail.challenge,
      payload.detail.decoupled ?? false,
    );
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
    clearCachedJson("bank-credentials");
    window.dispatchEvent(
      new CustomEvent("finance-bank-credentials-changed", { detail: payload }),
    );
  } catch {
    // ignore if running in non-browser environment
  }

  return payload;
}
