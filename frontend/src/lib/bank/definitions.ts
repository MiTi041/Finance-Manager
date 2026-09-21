import { getApiBaseUrl, parseJsonResponse } from "../api";

export type BankDefinition = {
  key: string;
  name: string;
  blz: string;
  fints_url: string;
  bank_logo: string;
  bank_logo_dark: string;
  /** Extra padding around the logo in pixels. 0 keeps the default spacing. */
  logo_padding?: number;
  can_transfer: boolean;
  /** Bank unterstützt SEPA-Instant (Echtzeit). */
  sepa_express: boolean;
  /** Fixed payout IBAN of a manual provider (e.g. Scalable's Verrechnungskonto). */
  sender_iban?: string | null;
  /** True when the bank has no FinTS endpoint and is maintained manually. */
  manual?: boolean;
  needs_tan_medium_name?: boolean;
  username_hint?: string | null;
};

export async function fetchAvailableBanks(): Promise<BankDefinition[]> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/banks`);
  const payload = await parseJsonResponse(response);
  return payload?.banks ?? [];
}
