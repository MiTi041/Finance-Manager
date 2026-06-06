export type FinanceCategory = {
  id: number;
  name: string;
  typ: string;
  parent_id: number | null;
  parent_name?: string | null;
  personal_expense: boolean;
  icon: string | null;
};

export type FlatCategoryNode = {
  category: FinanceCategory;
  depth: number;
};

export type Prediction = {
  transaction_id: number;
  entry_date: string | null;
  purpose: string;
  amount: number | null;
  applicant_name: string;
  recipient_name: string;
  predicted_category_id: number;
  similarity: number;
};
