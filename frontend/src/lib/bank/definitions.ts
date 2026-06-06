import { getApiBaseUrl, parseJsonResponse } from "../api";

export type BankDefinition = {
  key: string;
  name: string;
  blz: string;
  fints_url: string;
  bank_logo: string;
};

export async function fetchAvailableBanks(): Promise<BankDefinition[]> {
  const response = await fetch(`${getApiBaseUrl()}/bank-credentials/banks`);
  const payload = await parseJsonResponse(response);
  return payload?.banks ?? [];
}
