import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

type UpdateState =
  | { status: "idle" }
  | { status: "available"; version: string }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    if (!window.api) return;

    window.api.receive("update:available", (info: any) => {
      setUpdate({ status: "available", version: info?.version ?? "" });
    });

    window.api.receive("update:downloading", (data: any) => {
      setUpdate((prev) =>
        prev.status === "downloading"
          ? { status: "downloading", percent: data?.percent ?? 0 }
          : { status: "downloading", percent: data?.percent ?? 0 },
      );
    });

    window.api.receive("update:downloaded", (info: any) => {
      setUpdate({ status: "downloaded", version: info?.version ?? "" });
    });

    window.api.receive("update:error", (data: any) => {
      setUpdate({
        status: "error",
        message: data?.message ?? "Update fehlgeschlagen",
      });
    });
  }, []);

  if (update.status === "idle") return null;
  if (update.status === "error") return null;

  const handleClick = () => {
    if (update.status === "available") {
      setUpdate({ status: "downloading", percent: 0 });
      window.api?.downloadUpdate();
    } else if (update.status === "downloaded") {
      window.api?.installUpdate();
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      height={12}
      variant="outline"
      className="justify-start !px-3 transition hover:bg-sidebar-accent/55 group-data-[collapsible=icon]:hidden"
    >
      {update.status === "downloading" ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
        <span className="truncate text-sm font-semibold tracking-tight text-start">
          {update.status === "available" && "Update verfügbar"}
          {update.status === "downloading" &&
            `Lade herunter… ${update.percent}%`}
          {update.status === "downloaded" && "Update installieren"}
        </span>
        <span className="truncate text-[11px] text-muted-foreground text-start">
          {update.status === "downloading" && "Bitte warten…"}
          {update.status === "downloaded" && "Jetzt neu starten"}
        </span>
        {update.status === "available" && (
          <span className="truncate text-[10px] text-muted-foreground font-medium text-start">
            Jetzt herunterladen
          </span>
        )}
      </div>
      {update.status === "available" && (
        <span className="size-2 shrink-0 rounded-full bg-blue-500" />
      )}
    </Button>
  );
}
