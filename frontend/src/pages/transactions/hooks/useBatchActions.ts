"use client";

import { useState } from "react";
import { toast } from "sonner";

import { updateTransactionsCategoryBatch } from "@/lib/categories/category-transactions";
import {
  deleteTransactionsBatch,
} from "@/lib/transactions";

import { UNASSIGNED_CATEGORY_VALUE } from "@/lib/utils/categories";

type UseBatchActionsOptions = {
  selectedTransactionIds: Set<number>;
  clearSelection: () => void;
  reload: () => Promise<void>;
  expandedTransactionId: number | null;
  setExpandedTransactionId: (id: number | null) => void;
};

export function useBatchActions({
  selectedTransactionIds,
  clearSelection,
  reload,
  expandedTransactionId,
  setExpandedTransactionId,
}: UseBatchActionsOptions) {
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [batchCategoryId, setBatchCategoryId] = useState<string>("");
  const [applyingBatchCategory, setApplyingBatchCategory] = useState(false);

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

  return {
    batchDeleteOpen,
    setBatchDeleteOpen,
    deletingBatch,
    handleBatchDelete,
    batchCategoryId,
    setBatchCategoryId,
    applyingBatchCategory,
    handleBatchCategorize,
  };
}
