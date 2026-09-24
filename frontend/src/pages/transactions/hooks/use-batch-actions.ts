"use client";

import { useState } from "react";
import { toast } from "sonner";

import { updateTransactionsCategoryBatch } from "@/lib/categories/category-transactions";
import { createManualTransaction, deleteTransactionsBatch } from "@/lib/transactions";
import { transactionToManualInput } from "@/lib/manual-transaction";
import { type Transaction } from "@/types/transaction";

import { UNASSIGNED_CATEGORY_VALUE } from "@/lib/utils/categories";

type UseBatchActionsOptions = {
  selectedTransactionIds: Set<number>;
  selectedManualTransactions: Transaction[];
  clearSelection: () => void;
  reload: () => Promise<void>;
  expandedTransactionId: number | null;
  setExpandedTransactionId: (id: number | null) => void;
};

export function useBatchActions({
  selectedTransactionIds,
  selectedManualTransactions,
  clearSelection,
  reload,
  expandedTransactionId,
  setExpandedTransactionId,
}: UseBatchActionsOptions) {
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [batchCategoryId, setBatchCategoryId] = useState<string>("");
  const [applyingBatchCategory, setApplyingBatchCategory] = useState(false);
  const [duplicatingBatch, setDuplicatingBatch] = useState(false);

  const handleBatchDelete = async () => {
    setDeletingBatch(true);
    try {
      const ids = Array.from(selectedTransactionIds);
      await deleteTransactionsBatch(ids);
      if (
        expandedTransactionId &&
        selectedTransactionIds.has(expandedTransactionId)
      ) {
        setExpandedTransactionId(null);
      }
      clearSelection();
      setBatchDeleteOpen(false);
      await reload();
      toast.success(`${ids.length} Transaktionen gelöscht`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Transaktionen konnten nicht gelöscht werden",
      );
    } finally {
      setDeletingBatch(false);
    }
  };

  const handleBatchCategorize = async () => {
    if (batchCategoryId === "") return;
    setApplyingBatchCategory(true);
    try {
      const ids = Array.from(selectedTransactionIds);
      const categoryId =
        batchCategoryId === UNASSIGNED_CATEGORY_VALUE
          ? null
          : Number(batchCategoryId);
      await updateTransactionsCategoryBatch(ids, categoryId);
      clearSelection();
      setBatchCategoryId("");
      await reload();
      toast.success(`${ids.length} Transaktionen aktualisiert`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Kategorien konnten nicht zugewiesen werden",
      );
    } finally {
      setApplyingBatchCategory(false);
    }
  };

  const handleBatchDuplicate = async () => {
    if (selectedManualTransactions.length === 0) return;
    setDuplicatingBatch(true);
    try {
      for (const transaction of selectedManualTransactions) {
        await createManualTransaction({
          account_iban: transaction.konto.iban,
          ...transactionToManualInput(transaction),
        });
      }
      clearSelection();
      await reload();
      toast.success(`${selectedManualTransactions.length} Transaktionen dupliziert`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Transaktionen konnten nicht dupliziert werden",
      );
    } finally {
      setDuplicatingBatch(false);
    }
  };

  return {
    batchDeleteOpen,
    setBatchDeleteOpen,
    deletingBatch,
    handleBatchDelete,
    batchCategoryId,
    setBatchCategoryId,
    applyingBatchCategory,
    handleBatchCategorize,
    handleBatchDuplicate,
    duplicatingBatch,
  };
}
