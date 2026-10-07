import { useMemo, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LiquidityEntryInput } from "@/lib/liquidity";
import { formatAmount } from "@/lib/utils/format";
import { AutoItems } from "./components/auto-items";
import { EntryForm } from "./components/entry-form";
import { LiquidityResultCard } from "./components/liquidity-result-card";
import { useLiquidity } from "./hooks/use-liquidity";
import { buildAutoItems, computeLiquidity, type LiquidityAutoItem } from "./utils";

function defaultEndDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31);
}

export default function LiquidityPage() {
  const { entries, subscriptions, pending, balanceTotal, loading, error, create, update, remove } =
    useLiquidity();
  const today = useMemo(() => new Date(), []);
  const [endDate, setEndDate] = useState<Date | null>(defaultEndDate);
  const [startOverride, setStartOverride] = useState("");
  const [includeSubscriptions, setIncludeSubscriptions] = useState(true);
  const [includePending, setIncludePending] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startBalance =
    startOverride.trim() === ""
      ? balanceTotal
      : Number(startOverride.replace(",", ".")) || 0;

  const autoItems = useMemo<LiquidityAutoItem[]>(
    () =>
      buildAutoItems({
        subscriptions,
        pending,
        fromDate: today,
        endDate: endDate ?? defaultEndDate(),
        includeSubscriptions,
        includePending,
      }),
    [subscriptions, pending, today, endDate, includeSubscriptions, includePending],
  );

  const result = useMemo(
    () => computeLiquidity({ startBalance, entries, autoItems }),
    [startBalance, entries, autoItems],
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
      throw err;
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <Label htmlFor="start-balance">Startliquidität</Label>
            <Input
              id="start-balance"
              inputMode="decimal"
              className="w-40"
              placeholder={formatAmount(balanceTotal)}
              value={startOverride}
              onChange={(event) => setStartOverride(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Leer = aktueller Kontostand ({formatAmount(balanceTotal)})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Enddatum</Label>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
        </CardContent>
      </Card>

      <LiquidityResultCard result={result} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <Switch
                id="include-subscriptions"
                checked={includeSubscriptions}
                onCheckedChange={setIncludeSubscriptions}
              />
              <Label htmlFor="include-subscriptions">Abos einbeziehen</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="include-pending"
                checked={includePending}
                onCheckedChange={setIncludePending}
              />
              <Label htmlFor="include-pending">Vorgemerkte einbeziehen</Label>
            </div>
          </div>

          {autoItems.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Automatisch
              </span>
              <AutoItems items={autoItems} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Eigene Einträge
          </span>

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
                  Noch keine Einträge. Füge Einnahmen oder Ausgaben hinzu.
                </p>
              ) : (
                <div className="flex flex-col">
                  {entries.map((entry) =>
                    editingId === entry.id ? (
                      <div key={entry.id} className="border-b border-border/60 py-2 last:border-b-0">
                        <EntryForm
                          initial={entry}
                          submitLabel="Speichern"
                          onSubmit={(input) => handleUpdate(entry.id, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-b-0"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{entry.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {entry.certainty === "certain" ? "sicher" : "erwartet"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`tabular-nums ${
                              entry.kind === "expense"
                                ? "text-destructive"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {formatAmount(entry.kind === "expense" ? -entry.amount : entry.amount)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditingId(entry.id)}
                            aria-label="Bearbeiten"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={() => void handleRemove(entry.id)}
                            aria-label="Löschen"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}

              <div className="pt-1">
                <EntryForm submitLabel="Hinzufügen" onSubmit={handleCreate} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
