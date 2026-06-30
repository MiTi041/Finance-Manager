import { getApiBaseUrl } from "./api";

export interface ReceiptLineItem {
  name: string;
  price: number;
}

export interface ReceiptData {
  raw_text: string;
  items: ReceiptLineItem[];
  parsed: {
    store_name: string | null;
    total_amount: number | null;
    receipt_date: string | null;
  };
}

export interface Receipt {
  id: number;
  umsatz_id: number;
  image_filename: string;
  image_path: string;
  extracted_data: ReceiptData | null;
  store_name: string | null;
  total_amount: number | null;
  receipt_date: string | null;
  confidence: number | null;
  created_at: string;
}

export async function uploadReceipt(
  transactionId: number,
  file: File,
): Promise<Receipt> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/receipts`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? "Beleg konnte nicht hochgeladen werden");
  }

  const data = await response.json();
  return data.receipt;
}

export async function fetchReceipts(
  transactionId: number,
): Promise<Receipt[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/receipts`,
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? "Belege konnten nicht geladen werden");
  }

  const data = await response.json();
  return data.receipts;
}

export async function deleteReceipt(receiptId: number): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/receipts/${receiptId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? "Beleg konnte nicht gelöscht werden");
  }
}

export function getReceiptImageUrl(receiptId: number): string {
  return `${getApiBaseUrl()}/db/receipts/${receiptId}/image`;
}

export async function applyReceiptSplits(
  receiptId: number,
): Promise<{ splits: { betrag: number; kategorieId: null }[]; items: ReceiptLineItem[] }> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/receipts/${receiptId}/apply-splits`,
    { method: "POST" },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? "Splits konnten nicht erstellt werden");
  }
  return response.json();
}
