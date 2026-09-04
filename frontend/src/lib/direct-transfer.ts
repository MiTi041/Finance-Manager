import { getApiBaseUrl, parseJsonResponse } from "./api";
import { throwForTransfer409 } from "./allocation";
import { emitReferenceChange } from "./events";
import { buildTransferRequestBody, type DirectTransferPayload } from "./transfer-utils";

export { isValidIban } from "./transfer-utils";

export async function executeDirectTransfer(
  payload: DirectTransferPayload,
  tan?: string,
  vopToken?: string,
): Promise<{ status: string; transfer: unknown }> {
  const body = buildTransferRequestBody(payload);
  if (tan) body.tan = tan;
  if (vopToken) body.vop_token = vopToken;
  const response = await fetch(`${getApiBaseUrl()}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const data = await response.json().catch(() => ({}));
    throwForTransfer409(data?.detail || {});
  }

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}
