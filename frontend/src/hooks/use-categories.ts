import { useCallback, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/types/transaction";
import type { FinanceCategory, FlatCategoryNode } from "@/lib/categories/types";
import { fetchCategories } from "@/lib/categories/api";
import { buildFlatCategoryTree } from "@/lib/categories/category-tree";

export interface CategoryAnalytics {
  categoryId: number;
  name: string;
  typ: string;
  icon: string | null;
  depth: number;
  parentName: string | null;
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  percentage: number;
}

export function useCategories({
  transactions = [],
  deletedBankTransactionsIncluded = false,
}: {
  transactions?: Transaction[];
  deletedBankTransactionsIncluded?: boolean;
} = {}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawCategories, setRawCategories] = useState<FinanceCategory[]>([]);

  const loadCategories = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const cats = await fetchCategories();
      setRawCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorien konnten nicht geladen werden");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const onDataRefresh = () => void loadCategories();
    window.addEventListener("finance-reference-data-changed", onDataRefresh);
    return () => window.removeEventListener("finance-reference-data-changed", onDataRefresh);
  }, [loadCategories]);

  const categoryTree = useMemo(() => buildFlatCategoryTree(rawCategories), [rawCategories]);

  const cleanedTransactions = useMemo(
    () =>
      deletedBankTransactionsIncluded
        ? transactions
        : transactions.filter((t) => !t.technisch.bankDeleted),
    [deletedBankTransactionsIncluded, transactions],
  );

  const { categoryAnalytics, totalIncome, totalExpenses } = useMemo(() => {
    const byCategory = new Map<number, { total: number; count: number }>();

    cleanedTransactions.forEach((t) => {
      const catId = t.technisch.kategorieId;
      if (catId == null) return;
      const existing = byCategory.get(catId) ?? { total: 0, count: 0 };
      existing.total += t.betrag.wert;
      existing.count += 1;
      byCategory.set(catId, existing);
    });

    let income = 0;
    let expense = 0;

    const analytics: CategoryAnalytics[] = categoryTree.map(({ category, depth }) => {
      const data = byCategory.get(category.id);
      const total = data?.total ?? 0;
      const count = data?.count ?? 0;

      if (category.typ === "Einnahme" && total > 0) {
        income += total;
      } else if (category.typ === "Ausgabe" && total < 0) {
        expense += Math.abs(total);
      }

      return {
        categoryId: category.id,
        name: category.name,
        typ: category.typ,
        icon: category.icon,
        depth,
        parentName: category.parent_name ?? null,
        totalAmount: total,
        transactionCount: count,
        averageAmount: count > 0 ? total / count : 0,
        percentage: 0,
      };
    });

    analytics.forEach((a) => {
      if (a.typ === "Einnahme" && income > 0) {
        a.percentage = (a.totalAmount / income) * 100;
      } else if (a.typ === "Ausgabe" && expense > 0) {
        a.percentage = (Math.abs(a.totalAmount) / expense) * 100;
      }
    });

    return { categoryAnalytics: analytics, totalIncome: income, totalExpenses: expense };
  }, [categoryTree, cleanedTransactions]);

  const uncategorized = useMemo(() => {
    const txs = cleanedTransactions.filter((t) => t.technisch.kategorieId == null);
    const total = txs.reduce((s, t) => s + t.betrag.wert, 0);
    return { count: txs.length, total };
  }, [cleanedTransactions]);

  return {
    loading,
    refreshing,
    error,
    reload: loadCategories,
    categories: categoryTree,
    categoryAnalytics,
    totalIncome,
    totalExpenses,
    uncategorizedCount: uncategorized.count,
    uncategorizedTotal: uncategorized.total,
  };
}
