import { useEffect, useRef } from "react";
import { toast } from "sonner";

declare global {
  interface Window {
    api: {
      receive: (channel: string, func: (...args: unknown[]) => void) => void;
    };
  }
}

export function AutoUpdateToast() {
  const toastId = useRef<string | number | null>(null);

  useEffect(() => {
    if (!window.api) return;
    window.api.receive("update:checking", () => {
      toastId.current = toast.loading("Suche nach Updates...");
    });

    window.api.receive("update:downloading", (data: any) => {
      const pct = data?.percent ?? 0;
      toastId.current = toast.loading(
        `Update wird heruntergeladen… ${pct}%`,
        { id: toastId.current ?? undefined },
      );
    });

    window.api.receive("update:downloaded", () => {
      toast.success("Update heruntergeladen!", {
        id: toastId.current ?? undefined,
      });
      toastId.current = null;
    });

    window.api.receive("update:error", (data: any) => {
      toast.error(data?.message ?? "Update fehlgeschlagen", {
        id: toastId.current ?? undefined,
      });
      toastId.current = null;
    });
  }, []);

  return null;
}