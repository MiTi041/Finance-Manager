import { getApiBaseUrl, parseJsonResponse } from "./api";
import { TanRequiredError } from "./allocation";
import { emitReferenceChange } from "./events";
import { buildTransferRequestBody, type DirectTransferPayload } from "./transfer-utils";

export { isValidIban } from "./transfer-utils";

export async function executeDirectTransfer(
  payload: DirectTransferPayload,
  tan?: string,
): Promise<{ status: string; transfer: unknown }> {
  const body = buildTransferRequestBody(payload);
  if (tan) body.tan = tan;
  const response = await fetch(`${getApiBaseUrl()}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const data = await response.json().catch(() => ({}));
    const detail = data?.detail || {};
    if (detail?.code === "TAN_REQUIRED") {
      throw new TanRequiredError(detail.challenge, detail.decoupled);
    }
  }

  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}
