import { getApiBaseUrl } from "@/lib/api";

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number, code?: string) {
    super(
      code === "SYNC_ALL_LIMITED"
        ? `Komplett-Sync bereits durchgeführt. Bitte warte ${retryAfter} Sekunden.`
        : `Bitte warte ${retryAfter} Sekunden vor der nächsten Anfrage.`,
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

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
      const code = payload?.detail?.code ?? payload?.code;
      if (code === "RATE_LIMITED") {
        const retryAfter = payload?.detail?.retry_after ?? payload?.retry_after ?? 30;
        throw new RateLimitError(retryAfter, code);
      }
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
