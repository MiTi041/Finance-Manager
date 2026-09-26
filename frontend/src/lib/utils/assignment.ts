import type { Transaction } from "../../types/transaction";
import { isFullyRefunded } from "./refunds.ts";

export function isTransactionUnassigned(transaction: Transaction): boolean {
  if (isFullyRefunded(transaction)) return false;
  const splits = transaction.technisch.splits;
  if (splits && splits.length > 0) {
    return splits.some((split) => split.kategorieId == null);
  }
  return transaction.technisch.kategorieId == null;
}
