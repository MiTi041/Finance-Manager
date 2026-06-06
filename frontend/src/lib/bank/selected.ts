import { normalizeIban } from "@/lib/iban";

export type SelectedBankOption = {
  accountIban: string;
  accountName: string;
  bankName: string;
  bankLogo?: string;
  username?: string;
  scope: string;
  balanceCorrection?: number | null;
};

export function getSelectedBank(
  accountOptions: SelectedBankOption[],
  activeAccountIban: string,
) {
  if (activeAccountIban === "all") {
    return null;
  }

  const normalizedSelection = normalizeIban(activeAccountIban);
  if (!normalizedSelection) {
    return null;
  }

  return (
    accountOptions.find((item) => item.accountIban === normalizedSelection) ??
    null
  );
}
