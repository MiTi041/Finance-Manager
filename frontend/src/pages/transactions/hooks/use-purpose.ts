import { useEffect, useState } from "react";

import { type Transaction } from "@/types/transaction";

export function usePurpose(
  transaction: Transaction,
  isExpanded: boolean,
  onSavePurpose: (transactionId: number, purposeEdit: string | null) => Promise<void>,
) {
  const [purposeDraft, setPurposeDraft] = useState(transaction.texte.verwendungszweck);
  const [savingPurpose, setSavingPurpose] = useState(false);

  useEffect(() => {
    setPurposeDraft(transaction.texte.verwendungszweck);
  }, [transaction.id, transaction.texte.verwendungszweck]);

  useEffect(() => {
    if (!isExpanded) setPurposeDraft(transaction.texte.verwendungszweck);
  }, [isExpanded, transaction.texte.verwendungszweck]);

  const trimmedPurposeDraft = purposeDraft.trim();
  const trimmedSavedPurpose = transaction.texte.verwendungszweck.trim();
  const purposeChanged = trimmedPurposeDraft !== trimmedSavedPurpose;

  const hasEdit = transaction.texte.verwendungszweckEdit != null;

  const savePurpose = async () => {
    if (!purposeChanged || savingPurpose) return;
    setSavingPurpose(true);
    try {
      await onSavePurpose(transaction.id, trimmedPurposeDraft || null);
    } finally {
      setSavingPurpose(false);
    }
  };

  const clearPurpose = async () => {
    if (savingPurpose) return;
    setSavingPurpose(true);
    try {
      await onSavePurpose(transaction.id, null);
    } finally {
      setSavingPurpose(false);
    }
  };

  const resetPurpose = () => setPurposeDraft(transaction.texte.verwendungszweck);

  return {
    purposeDraft,
    setPurposeDraft,
    savingPurpose,
    setSavingPurpose,
    purposeChanged,
    hasEdit,
    trimmedPurposeDraft,
    savePurpose,
    clearPurpose,
    resetPurpose,
  };
}
