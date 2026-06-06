export type { FinanceCategory, FlatCategoryNode, Prediction } from "./categories/types";
export { buildFlatCategoryTree } from "./categories/category-tree";
export { fetchCategories, createCategory, updateCategory, deleteCategory } from "./categories/api";
export { triggerAutoCategorize, applyPrediction, applyAllPredictions } from "./categories/auto-categorize";
export { updateTransactionCategory, updateTransactionsCategoryBatch } from "./categories/category-transactions";
