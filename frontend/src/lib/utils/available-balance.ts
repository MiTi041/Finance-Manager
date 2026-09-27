// Saldo-Korrektur und Buchungssumme sind Floats und driften um Cents-Bruchteile
// (z. B. 2.4e-13). Angezeigt wird auf Cent gerundet, also muss die Überweisbarkeit
// dieselbe gerundete Zahl verwenden – sonst gilt 0,00 € als "Guthaben".
export function availableBalance(account: {
  balance: number;
  balancePending?: number;
}): number {
  const cents = Math.round((account.balance + (account.balancePending ?? 0)) * 100);
  return cents === 0 ? 0 : cents / 100;
}
