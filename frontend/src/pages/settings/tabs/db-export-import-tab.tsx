import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { Download, Upload, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8112/api";

const isElectron = typeof window !== "undefined" && !!(window as any).api;

export function DbExportImportTab() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportViaElectron = useCallback(async () => {
    const result = await (window as any).api.dbExport();
    if (result.success) {
      toast.success("Datenbank erfolgreich exportiert.");
    } else if (result.error && result.error !== "Abgebrochen") {
      toast.error(result.error);
    }
  }, []);

  const handleExportViaApi = useCallback(async () => {
    const res = await fetch(`${API_BASE}/db/export`);
    if (!res.ok) throw new Error("Export fehlgeschlagen");

    const blob = await res.blob();

    if ("showSaveFilePicker" in window) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: "finance-backup.zip",
        types: [
          {
            description: "Zip-Archiv",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "finance-backup.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (isElectron) {
        await handleExportViaElectron();
      } else {
        await handleExportViaApi();
        toast.success("Datenbank erfolgreich exportiert.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  };

  const handleImportViaElectron = useCallback(async () => {
    const result = await (window as any).api.dbImport();
    if (result.success) {
      toast.success("Datenbank importiert. Die Seite wird neu geladen…");
      setTimeout(() => window.location.reload(), 2000);
    } else if (result.error && result.error !== "Abgebrochen") {
      toast.error(result.error);
    }
  }, []);

  const handleImportViaApi = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/db/import`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail ?? err?.message ?? "Import fehlgeschlagen");
    }

    toast.success("Datenbank importiert. Die Seite wird neu geladen…");
    setTimeout(() => window.location.reload(), 2000);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      toast.error("Nur .zip Dateien werden unterstützt.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    try {
      if (isElectron) {
        await handleImportViaElectron();
      } else {
        await handleImportViaApi(file);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Import fehlgeschlagen");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-6">
      <Card className="py-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 min-w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Download className="size-5" />
            </div>
            <div>
              <CardTitle>Datenbank exportieren</CardTitle>
              <CardDescription>
                Exportiere den gesamten Datenbank-State (DB, Credentials, Kategorisierungs-Modell)
                als Zip-Archiv
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exportiert…" : "Exportieren"}
          </Button>
        </CardContent>
      </Card>

      <Card className="py-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 min-w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Upload className="size-5" />
            </div>
            <div>
              <CardTitle>Datenbank importieren</CardTitle>
              <CardDescription>
                Stelle einen zuvor exportierten State vollständig wieder her
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>Vorhandene Daten werden überschrieben. Erstelle vorher ein Backup.</span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              "Importiert…"
            ) : (
              <>
                <Upload className="size-4" />
                Zip-Datei auswählen & importieren
              </>
            )}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleFileChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
