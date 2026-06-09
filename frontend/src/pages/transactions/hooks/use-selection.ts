"use client";

import { useState } from "react";

import { type Transaction } from "@/types/transaction";

export function useSelection(filteredTransactions: Transaction[]) {
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<
    Set<number>
  >(new Set());

  const selectedCount = selectedTransactionIds.size;

  const handleSelectChange = (id: number, selected: boolean) => {
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const isAllVisibleSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((t) => selectedTransactionIds.has(t.id));

  const handleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedTransactionIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  const clearSelection = () => {
    setSelectedTransactionIds(new Set());
  };

  return {
    selectedTransactionIds,
    selectedCount,
    handleSelectChange,
    isAllVisibleSelected,
    handleSelectAllVisible,
    clearSelection,
  };
}
