import { getApiBaseUrl } from "@/lib/db";

type SyncBankContext = {
  scope?: string;
};

export async function importFromFintsServer(
  onProgress: (percent: number) => void,
  days = 730,
  onTanRequiredChange?: (visible: boolean) => void,
  context?: SyncBankContext,
) {
  const baseUrl = getApiBaseUrl();
  let tanHintVisible = false;
  const tanHintTimer = window.setTimeout(() => {
    tanHintVisible = true;
    onTanRequiredChange?.(true);
  }, 3500);

  try {
    const response = await fetch(`${baseUrl}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ days, scope: context?.scope }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = payload?.detail?.code;
      if (code === "TAN_REQUIRED" && !tanHintVisible) {
        tanHintVisible = true;
        onTanRequiredChange?.(true);
      }
      throw new Error(
        payload?.detail?.message ??
          payload?.detail ??
          code ??
          "FinTS request failed",
      );
    }

    onProgress(100);
  } finally {
    window.clearTimeout(tanHintTimer);
    onTanRequiredChange?.(false);
  }
}
