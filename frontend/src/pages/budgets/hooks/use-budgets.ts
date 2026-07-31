import { useCallback, useEffect, useState } from "react";
import type { FinanceCategory } from "@/lib/categories/types";
import {
  fetchBudgets,
  createBudget as createBudgetApi,
  updateBudget as updateBudgetApi,
  deleteBudget as deleteBudgetApi,
  type Budget,
} from "@/lib/budgets";
import { fetchCategories } from "@/lib/categories/api";
import { currentMonth } from "../utils";

export function useBudgets() {
  const [month, setMonth] = useState(currentMonth);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetRows, cats] = await Promise.all([fetchBudgets(month), fetchCategories()]);
      setBudgets(budgetRows);
      setCategories(cats.filter((c) => c.typ === "Ausgabe"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (name: string, categoryIds: number[], amount: number) => {
      await createBudgetApi(name, categoryIds, amount);
      await load();
    },
    [load],
  );

  const update = useCallback(
    async (id: number, name: string, categoryIds: number[], amount: number) => {
      await updateBudgetApi(id, name, categoryIds, amount);
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteBudgetApi(id);
      await load();
    },
    [load],
  );

  return { month, setMonth, budgets, categories, loading, error, load, create, update, remove };
}
