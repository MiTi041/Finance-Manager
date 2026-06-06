export type SelectedBankOption = {
  accountIban: string;
  accountName: string;
  bankName: string;
  bankLogo?: string;
  username?: string;
  scope: string;
};

function normalizeIban(value?: string | null) {
  return value ? value.replace(/\s+/g, "").toUpperCase() : "";
}

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
