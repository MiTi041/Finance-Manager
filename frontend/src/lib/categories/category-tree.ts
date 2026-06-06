import { type FinanceCategory, type FlatCategoryNode } from "./types";

export function buildFlatCategoryTree(categories: FinanceCategory[]): FlatCategoryNode[] {
  const childrenByParent = new Map<number | null, FinanceCategory[]>();

  categories.forEach((category) => {
    const key = category.parent_id ?? null;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
  });

  const compareByTypeName = (a: FinanceCategory, b: FinanceCategory) =>
    a.typ.localeCompare(b.typ, "de") ||
    a.name.localeCompare(b.name, "de") ||
    a.id - b.id;

  const sortByTypeName = (items: FinanceCategory[]) =>
    [...items].sort(compareByTypeName);

  const output: FlatCategoryNode[] = [];
  const visited = new Set<number>();

  const walk = (parentId: number | null, depth: number) => {
    sortByTypeName(childrenByParent.get(parentId) ?? []).forEach((category) => {
      if (visited.has(category.id)) return;
      visited.add(category.id);
      output.push({ category, depth });
      walk(category.id, depth + 1);
    });
  };

  walk(null, 0);

  categories
    .filter((category) => !visited.has(category.id))
    .sort(compareByTypeName)
    .forEach((category) => {
      output.push({ category, depth: 0 });
    });

  return output;
}
