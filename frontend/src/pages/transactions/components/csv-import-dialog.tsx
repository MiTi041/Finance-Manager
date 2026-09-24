import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type CsvPreviewRow,
  type CsvSchemaInfo,
  fetchCsvSchemas,
  importCsvTransactions,
  previewCsvImport,
} from "@/lib/transactions";

type CsvImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountIban: string;
  onImported: () => void | Promise<void>;
};

type Status = CsvPreviewRow["status"];
type Filter = Status | "all";
type Busy = "preview" | "import" | null;

const STATUS_META: Record<
  Status,
  {
    label: string;
    plural: string;
    icon: LucideIcon;
    tile: string; // Icon-Kachel
    pill: string; // Badge in der Tabelle
    active: string; // aktiver Filter
  }
> = {
  ok: {
    label: "Neu",
    plural: "Neu",
    icon: CheckCircle2,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    active: "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30",
  },
  duplicate: {
    label: "Duplikat",
    plural: "Duplikate",
    icon: Copy,
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    active: "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/30",
  },
  invalid: {
    label: "Ungültig",
    plural: "Ungültig",
    icon: XCircle,
    tile: "bg-red-500/10 text-red-600 dark:text-red-400",
    pill: "bg-red-500/10 text-red-700 dark:text-red-400",
    active: "border-red-500/50 bg-red-500/5 ring-1 ring-red-500/30",
  },
};

const STATUS_ORDER: Status[] = ["ok", "duplicate", "invalid"];

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function formatAmount(value: CsvPreviewRow["amount"]) {
  if (value === null || value === undefined || value === "") return "–";
  return typeof value === "number" ? eur.format(value) : String(value);
}

function isNegative(value: CsvPreviewRow["amount"]) {
  return typeof value === "number"
    ? value < 0
    : String(value ?? "")
        .trim()
        .startsWith("-");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isCsv(file: File) {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  // Zähler verhindert Flackern, wenn der Cursor über Kindelemente wandert
  const depth = useRef(0);

  return (
    <label
      htmlFor="csv-file"
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const dropped = event.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
      className={cn(
        "group relative flex min-h-52 cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        dragging
          ? "border-primary bg-primary/[0.06]"
          : "border-border/80 bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      {/* weicher Lichtfleck hinter dem Icon */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-[65%] rounded-full bg-primary/10 blur-3xl transition-opacity duration-300",
          dragging ? "opacity-100" : "opacity-0 group-hover:opacity-70",
        )}
      />
      <input
        id="csv-file"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) onFile(picked);
          // gleiche Datei erneut wählbar machen
          event.target.value = "";
        }}
      />
      <div
        className={cn(
          "relative flex size-14 items-center justify-center rounded-2xl shadow-sm ring-1 transition-all duration-200",
          dragging
            ? "-translate-y-1 scale-105 bg-primary text-primary-foreground ring-primary"
            : "bg-background text-muted-foreground ring-border group-hover:-translate-y-0.5 group-hover:text-foreground",
        )}
      >
        <UploadCloud className="size-7" aria-hidden />
      </div>
      <div className="relative space-y-1.5">
        <p className="text-sm font-medium">
          {dragging ? "Zum Hochladen loslassen" : "CSV-Datei hierher ziehen"}
        </p>
        <p className="text-xs text-muted-foreground">
          oder{" "}
          <span className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors group-hover:decoration-foreground">
            Datei auswählen
          </span>
        </p>
      </div>
    </label>
  );
}

export function CsvImportDialog({
  open,
  onOpenChange,
  accountIban,
  onImported,
}: CsvImportDialogProps) {
  const [schemas, setSchemas] = useState<CsvSchemaInfo[]>([]);
  const [schemaKey, setSchemaKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CsvPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<Busy>(null);
  // Verwirft veraltete Antworten, wenn schnell Datei oder Format gewechselt wird
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    requestId.current += 1;
    setRows(null);
    setFile(null);
    setError(null);
    setFilter("all");
    setBusy(null);
    fetchCsvSchemas()
      .then((list) => {
        setSchemas(list);
        setSchemaKey((current) => current || list[0]?.key || "");
      })
      .catch(() => toast.error("CSV-Formate konnten nicht geladen werden"));
  }, [open]);

  const runPreview = useCallback(
    async (nextFile: File, key: string) => {
      const id = ++requestId.current;
      setBusy("preview");
      setError(null);
      setRows(null);
      setFilter("all");
      try {
        const result = await previewCsvImport(accountIban, key, nextFile);
        if (id !== requestId.current) return;
        setRows(result.rows);
        if (result.rows.length === 0) toast.info("Keine Zeilen in der Datei gefunden");
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden");
      } finally {
        if (id === requestId.current) setBusy(null);
      }
    },
    [accountIban],
  );

  const handleFile = (next: File) => {
    if (!isCsv(next)) {
      toast.error("Bitte eine CSV-Datei auswählen");
      return;
    }
    setFile(next);
    if (schemaKey) void runPreview(next, schemaKey);
  };

  const handleSchemaChange = (key: string) => {
    setSchemaKey(key);
    if (file) void runPreview(file, key);
  };

  const clearFile = () => {
    requestId.current += 1;
    setFile(null);
    setRows(null);
    setError(null);
    setFilter("all");
    setBusy(null);
  };

  const handleImport = async () => {
    if (!rows) return;
    const importable = rows.filter((row) => row.status !== "invalid");
    if (importable.length === 0) {
      toast.error("Keine importierbaren Zeilen vorhanden");
      return;
    }
    setBusy("import");
    try {
      const result = await importCsvTransactions(accountIban, importable);
      toast.success(`${result.inserted} Buchungen importiert, ${result.ignored} übersprungen`);
      onOpenChange(false);
      await onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const counts: Record<Status, number> | null = rows
    ? {
        ok: rows.filter((row) => row.status === "ok").length,
        duplicate: rows.filter((row) => row.status === "duplicate").length,
        invalid: rows.filter((row) => row.status === "invalid").length,
      }
    : null;

  const visibleRows = rows ? rows.filter((row) => filter === "all" || row.status === filter) : [];
  const previewing = busy === "preview";
  const importing = busy === "import";
  const skipped = counts ? counts.duplicate + counts.invalid : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (importing ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-4xl sm:max-w-4xl gap-6">
        <DialogHeader>
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <FileSpreadsheet className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle className="text-lg leading-none tracking-tight">
                CSV importieren
              </DialogTitle>
              <DialogDescription className="truncate font-mono text-xs tracking-tight">
                {accountIban}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Bankformat</Label>
            <Select value={schemaKey} onValueChange={handleSchemaChange} disabled={importing}>
              <SelectTrigger className="h-10 rounded-lg bg-background shadow-xs">
                <SelectValue placeholder="Format wählen" />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((schema) => (
                  <SelectItem key={schema.key} value={schema.key}>
                    {schema.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {file ? (
            <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border bg-gradient-to-b from-muted/40 to-muted/20 p-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm ring-1 ring-border">
                {previewing ? (
                  <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                ) : (
                  <FileSpreadsheet className="size-5 text-foreground/70" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {previewing
                    ? "Datei wird gelesen …"
                    : `${formatSize(file.size)}${rows ? ` · ${rows.length} Zeilen` : ""}`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-foreground"
                onClick={clearFile}
                disabled={importing}
                aria-label="Datei entfernen"
              >
                <X className="size-4" />
              </Button>
              {previewing ? (
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary/60"
                />
              ) : null}
            </div>
          ) : (
            <Dropzone onFile={handleFile} />
          )}

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <AlertCircle className="size-4 text-destructive" aria-hidden />
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="font-medium text-destructive">Datei konnte nicht gelesen werden</p>
                <p className="text-muted-foreground">{error}</p>
              </div>
              {file ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-background"
                  onClick={() => runPreview(file, schemaKey)}
                >
                  Erneut versuchen
                </Button>
              ) : null}
            </div>
          ) : null}

          {counts ? (
            <div className="grid grid-cols-3 gap-2.5">
              {STATUS_ORDER.map((status) => {
                const meta = STATUS_META[status];
                const Icon = meta.icon;
                const active = filter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={active}
                    disabled={counts[status] === 0}
                    onClick={() => setFilter(active ? "all" : status)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      active ? meta.active : "hover:border-foreground/20 hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        meta.tile,
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xl font-semibold leading-none tabular-nums">
                        {counts[status]}
                      </span>
                      <span className="mt-1 truncate text-xs text-muted-foreground">
                        {meta.plural}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {rows && visibleRows.length > 0 ? (
            <div className="max-h-56 overflow-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted/90 text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Datum</th>
                    <th className="px-3 py-2.5 text-right font-medium">Betrag</th>
                    <th className="px-3 py-2.5 text-left font-medium">Empfänger</th>
                    <th className="px-3 py-2.5 text-left font-medium">Verwendungszweck</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleRows.map((row, index) => (
                    <tr
                      key={`${row.transaction_id ?? "row"}-${index}`}
                      className={cn(
                        "transition-colors hover:bg-muted/40",
                        row.status !== "ok" && "text-muted-foreground",
                      )}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                            STATUS_META[row.status].pill,
                          )}
                        >
                          {STATUS_META[row.status].label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {row.date ?? "–"}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-right tabular-nums",
                          row.status === "ok" && "font-medium",
                          row.status === "ok" &&
                            isNegative(row.amount) &&
                            "text-red-700 dark:text-red-400",
                          row.status === "ok" &&
                            !isNegative(row.amount) &&
                            "text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {formatAmount(row.amount)}
                      </td>
                      <td
                        className="max-w-56 truncate px-3 py-2"
                        title={row.recipient_name ?? undefined}
                      >
                        {row.recipient_name ?? "–"}
                      </td>
                      <td
                        className={cn(
                          "max-w-xs truncate px-3 py-2",
                          row.error && "text-red-700 dark:text-red-400",
                        )}
                        title={row.error ?? row.purpose ?? undefined}
                      >
                        {row.error ?? row.purpose ?? "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <DialogFooter className="items-center">
          {counts && skipped > 0 ? (
            <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
              {skipped} {skipped === 1 ? "Zeile wird" : "Zeilen werden"} übersprungen
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            className="min-w-44 gap-2"
            onClick={handleImport}
            disabled={!counts || counts.ok === 0 || busy !== null}
          >
            {importing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            <span>
              {counts && counts.ok > 0
                ? `${counts.ok} ${counts.ok === 1 ? "Buchung" : "Buchungen"} importieren`
                : "Importieren"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
