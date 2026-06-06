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
      setUpdate({ status: "downloading", percent: data?.percent ?? 0 });
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

  if (update.status === "idle" || update.status === "error") return null;

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
      height={14}
      className="!h-14 w-full justify-start !px-3 transition hover:bg-sidebar-accent/55 
                 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:w-8 
                 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!p-0 
                 group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:shadow-none 
                 group-data-[collapsible=icon]:mx-auto"
      variant="outline"
    >
      {/* Das Icon ist immer sichtbar, wird aber im Icon-Zustand zentriert */}
      {update.status === "downloading" ? (
        <RefreshCw className="size-4 animate-spin shrink-0" />
      ) : (
        <Download className="size-4 shrink-0" />
      )}

      {/* Der Text-Container wird ausgeblendet, wenn die Sidebar kollabiert ist */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none text-start group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold tracking-tight">
          {update.status === "available" && "Update verfügbar"}
          {update.status === "downloading" && `Lade herunter… ${update.percent}%`}
          {update.status === "downloaded" && "Update installieren"}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {update.status === "downloading" && "Bitte warten…"}
          {update.status === "downloaded" && "Jetzt neu starten"}
        </span>
        {update.status === "available" && (
          <span className="truncate text-[10px] text-muted-foreground font-medium">
            Jetzt herunterladen
          </span>
        )}
      </div>

      {/* Der blaue Punkt wird ebenfalls ausgeblendet, wenn die Sidebar kollabiert ist */}
      {update.status === "available" && (
        <span className="size-2 shrink-0 rounded-full bg-blue-500 group-data-[collapsible=icon]:hidden" />
      )}
    </Button>
  );
}
