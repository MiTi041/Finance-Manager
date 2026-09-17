type RefundableTransaction = {
  betrag: { wert: number; refundTotal: number };
  refundAttributed: number;
  refundLinks: unknown[];
};

export function isFullyRefunded(transaction: RefundableTransaction): boolean {
  const { wert, refundTotal } = transaction.betrag;
  if (wert < 0) return wert + refundTotal >= 0;
  if (wert > 0 && transaction.refundLinks.length > 0) {
    return wert - transaction.refundAttributed <= 0;
  }
  return false;
}
