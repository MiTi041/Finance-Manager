import { useEffect, useState } from "react";

import { type Transaction, type TransactionSplit } from "@/types/transaction";

export function useSplits(
  transaction: Transaction,
  isExpanded: boolean,
  onSaveSplits: (transactionId: number, splits: TransactionSplit[] | null) => void,
) {
  const cloneSplits = () =>
    transaction.technisch.splits ? transaction.technisch.splits.map((s) => ({ ...s })) : null;

  const [splitDrafts, setSplitDrafts] = useState<TransactionSplit[] | null>(cloneSplits);
  const [savingSplits, setSavingSplits] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      setSplitDrafts(null);
    } else {
      setSplitDrafts(
        transaction.technisch.splits ? transaction.technisch.splits.map((s) => ({ ...s })) : null,
      );
    }
  }, [isExpanded, transaction.texte.anmerkung, transaction.technisch.splits]);

  const hasSplits = splitDrafts != null && splitDrafts.length > 0;
  const sign = transaction.betrag.wert < 0 ? -1 : 1;
  const absTotal = Math.abs(transaction.betrag.wert);
  const splitAbsSum = hasSplits ? splitDrafts.reduce((sum, s) => sum + Math.abs(s.betrag), 0) : 0;
  const splitMatchesTotal = Math.round(splitAbsSum * 100) === Math.round(absTotal * 100);

  const splitsChanged =
    JSON.stringify(splitDrafts) !== JSON.stringify(transaction.technisch.splits);

  const initFirstSplit = () => {
    const half = Math.round((absTotal / 2) * 100) / 100;
    const rest = Math.round((absTotal - half) * 100) / 100;
    setSplitDrafts([
      { betrag: half * sign, kategorieId: null },
      { betrag: rest * sign, kategorieId: null },
    ]);
  };

  const handleAddSplit = () => {
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const extra = Math.round((absTotal / (prev.length + 1)) * 100) / 100;
      const redistributed = Array.from({ length: prev.length + 1 }, () => ({
        betrag: extra * sign,
        kategorieId: null as number | null,
      }));
      const diff = Math.round((absTotal - extra * redistributed.length) * 100) / 100;
      if (diff !== 0) {
        redistributed[redistributed.length - 1].betrag =
          Math.round((redistributed[redistributed.length - 1].betrag + diff * sign) * 100) / 100;
      }
      return redistributed;
    });
  };

  const handleRemoveSplit = (index: number) => {
    if (!splitDrafts) return;
    if (splitDrafts.length <= 2) {
      handleRemoveAllSplits();
      return;
    }
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      const remainingAbsSum = next.reduce((s, x) => s + Math.abs(x.betrag), 0);
      const diff = Math.round((absTotal - remainingAbsSum) * 100) / 100;
      if (diff !== 0) {
        next[next.length - 1].betrag =
          Math.round((Math.abs(next[next.length - 1].betrag) + diff) * sign * 100) / 100;
      }
      return next;
    });
  };

  const handleSplitAmountChange = (index: number, value: number) => {
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) => ({ ...s }));
      next[index].betrag = value * sign;
      return next;
    });
  };

  const handleSplitCategoryChange = (index: number, categoryId: number | null) => {
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) => ({ ...s }));
      next[index].kategorieId = categoryId;
      return next;
    });
  };

  const handleRemoveAllSplits = () => {
    setSplitDrafts(null);
    onSaveSplits(transaction.id, null);
  };

  const saveSplits = () => onSaveSplits(transaction.id, splitDrafts);

  const resetSplits = () => setSplitDrafts(cloneSplits());

  return {
    splitDrafts,
    setSplitDrafts,
    savingSplits,
    setSavingSplits,
    hasSplits,
    sign,
    absTotal,
    splitAbsSum,
    splitMatchesTotal,
    splitsChanged,
    initFirstSplit,
    handleAddSplit,
    handleRemoveSplit,
    handleSplitAmountChange,
    handleSplitCategoryChange,
    handleRemoveAllSplits,
    saveSplits,
    resetSplits,
  };
}
