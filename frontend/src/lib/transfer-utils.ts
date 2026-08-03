export type DirectTransferPayload = {
  senderIban: string;
  recipientName: string;
  recipientIban: string;
  recipientBic?: string;
  amount: number;
  reason: string;
};

export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let digits = "";
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    digits += code >= 65 && code <= 90 ? String(code - 55) : char;
  }
  let remainder = 0;
  for (let i = 0; i < digits.length; i++) {
    remainder = (remainder * 10 + Number(digits[i])) % 97;
  }
  return remainder === 1;
}

export function buildTransferRequestBody(payload: DirectTransferPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    recipient_iban: payload.recipientIban,
    recipient_name: payload.recipientName,
    amount: payload.amount,
    reason: payload.reason,
    sender_iban: payload.senderIban,
    sender_name: "Finance-Manager",
  };
  if (payload.recipientBic) body.recipient_bic = payload.recipientBic;
  return body;
}
