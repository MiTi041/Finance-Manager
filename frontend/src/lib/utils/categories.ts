import { buildFlatCategoryTree } from "../categories/category-tree";
import type { FinanceCategory } from "../categories/types";

export const UNASSIGNED_CATEGORY_VALUE = "__unassigned__";

export type TransactionCategoryOption = {
  value: string;
  label: string;
  icon: string | null;
  depth: number;
  typ: string;
};

export function buildCategoryOptions(categories: FinanceCategory[]) {
  return buildFlatCategoryTree(categories).map(({ category, depth }) => ({
    value: String(category.id),
    label: `${"\u00A0\u00A0".repeat(depth)}${category.name}`,
    icon: category.icon,
    depth,
    typ: category.typ,
  }));
}
