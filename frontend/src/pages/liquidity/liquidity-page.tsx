import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LiquidityEntryInput } from "@/lib/liquidity";
import { formatAmount } from "@/lib/utils/format";
import { EntryForm } from "./components/entry-form";
import { LiquidityResultCard } from "./components/liquidity-result-card";
import { useLiquidity } from "./hooks/use-liquidity";
import { computeLiquidity, parseHiddenEntries } from "./utils";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium">{children}</h2>;
}

const START_BALANCE_STORAGE_KEY = "liquidity.startBalance";
const HIDDEN_STORAGE_KEY = "liquidity.hiddenEntries";

export default function LiquidityPage() {
  const { entries, balanceTotal, loading, error, create, update, remove } = useLiquidity();
  const [startOverride, setStartOverride] = useState(
    () => window.localStorage.getItem(START_BALANCE_STORAGE_KEY) ?? "",
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(
    () => new Set(parseHiddenEntries(window.localStorage.getItem(HIDDEN_STORAGE_KEY))),
  );

  useEffect(() => {
    if (startOverride) window.localStorage.setItem(START_BALANCE_STORAGE_KEY, startOverride);
    else window.localStorage.removeItem(START_BALANCE_STORAGE_KEY);
  }, [startOverride]);

  useEffect(() => {
    if (hiddenIds.size)
      window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenIds]));
    else window.localStorage.removeItem(HIDDEN_STORAGE_KEY);
  }, [hiddenIds]);

  const toggleHidden = (id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const parsedStart = Number(startOverride.trim().replace(",", "."));
  const startInvalid = startOverride.trim() !== "" && !Number.isFinite(parsedStart);
  const startBalance =
    startOverride.trim() === "" || startInvalid ? (balanceTotal ?? 0) : parsedStart;

  const result = useMemo(
    () =>
      computeLiquidity({
        startBalance,
        entries: entries.filter((entry) => !hiddenIds.has(entry.id)),
      }),
    [startBalance, entries, hiddenIds],
  );

  const handleCreate = async (input: LiquidityEntryInput) => {
    try {
      await create(input);
      toast.success("Eintrag angelegt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  };

  const handleUpdate = async (id: number, input: LiquidityEntryInput) => {
    try {
      await update(id, input);
      setEditingId(null);
      toast.success("Eintrag aktualisiert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await remove(id);
      toast.success("Eintrag gelöscht");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-8 sm:px-0">
      <LiquidityResultCard result={result} />

      {/* Rahmenbedingungen */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start-balance">Startliquidität</Label>
          <div className="flex items-center gap-1">
            <Input
              id="start-balance"
              inputMode="decimal"
              className="tabular-nums"
              placeholder={balanceTotal === null ? "Betrag eingeben" : formatAmount(balanceTotal)}
              aria-invalid={startInvalid}
              value={startOverride}
              onChange={(event) => setStartOverride(event.target.value)}
            />
            {startOverride ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setStartOverride("")}
              >
                Zurücksetzen
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {startInvalid
              ? "Bitte eine Zahl eingeben, z. B. 1250,50"
              : balanceTotal === null
                ? "Kontostand nicht verfügbar. Bitte manuell eintragen."
                : "Leer lassen für den aktuellen Kontostand."}
          </p>
        </div>
      </section>

      {/* Eigene Einträge */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Einträge</SectionTitle>

        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <EmptyState title="Einträge konnten nicht geladen werden" text={error} />
        ) : (
          <>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Einträge. Trage unten Einnahmen oder Ausgaben ein.
              </p>
            ) : (
              <ul className="flex flex-col">
                {entries.map((entry) =>
                  editingId === entry.id ? (
                    <li key={entry.id} className="border-b border-border/60 py-3 last:border-b-0">
                      <EntryForm
                        initial={entry}
                        submitLabel="Speichern"
                        onSubmit={(input) => handleUpdate(entry.id, input)}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <li
                      key={entry.id}
                      className={`group flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-sm last:border-b-0 ${
                        hiddenIds.has(entry.id) ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span
                          className={`truncate ${
                            hiddenIds.has(entry.id) ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {entry.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex items-center opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            onClick={() => toggleHidden(entry.id)}
                            aria-pressed={hiddenIds.has(entry.id)}
                            aria-label={
                              hiddenIds.has(entry.id)
                                ? `${entry.label} einblenden`
                                : `${entry.label} ausblenden`
                            }
                          >
                            {hiddenIds.has(entry.id) ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            onClick={() => setEditingId(entry.id)}
                            aria-label={`${entry.label} bearbeiten`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => void handleRemove(entry.id)}
                            aria-label={`${entry.label} löschen`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        <span
                          className={`tabular-nums ${
                            entry.kind === "expense"
                              ? "text-destructive"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {formatAmount(entry.kind === "expense" ? -entry.amount : entry.amount)}
                        </span>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}

            <div className="sticky bottom-0 z-10 -mx-4 mt-2 bg-background px-4 pb-6 pt-2 sm:mx-0 sm:px-0">
              <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent" />
              <EntryForm submitLabel="Hinzufügen" onSubmit={handleCreate} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
