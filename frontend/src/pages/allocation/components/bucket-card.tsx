import { useEffect, useState } from "react";
import {
  PiggyBank,
  ShieldCheck,
  Settings2,
  TrendingUp,
  Heart,
  Wallet,
  CheckCircle2,
  Info,
  HashIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpButton } from "@/components/ui/help-button";
import { formatAmount } from "@/lib/utils/format";
import type { AllocationBucket, AllocationRunBucket } from "@/lib/allocation";

export const bucketLabels: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

const bucketIcons: Record<string, React.ReactNode> = {
  bafoeg: <PiggyBank className="size-4" />,
  emergency: <ShieldCheck className="size-4" />,
  invest: <TrendingUp className="size-4" />,
  donation: <Heart className="size-4" />,
  spending: <Wallet className="size-4" />,
};

const bucketTags: Record<string, string> = {
  bafoeg: "tag.bafoegrueckzahlung",
  emergency: "tag.notfallfonds",
  invest: "tag.investieren",
  donation: "tag.spenden",
};

const bucketDescriptions: Record<string, (pct: number) => string> = {
  spending: () => "Budget nach Sparplänen, Notgroschen, Investieren und Spenden.",
  emergency: (pct) => `${pct}% vom verbleibenden Netto nach Sparplänen.`,
  invest: (pct) => `${pct}% vom verbleibenden Netto nach Sparplänen.`,
  donation: (pct) => `${pct}% vom Netto-Einkommen.`,
};
const bucketDescriptionsBafoeg: Record<string, (pct: number) => string> = {
  spending: () => "Budget nach Bafög, Sparplänen, Notgroschen, Investieren und Spenden.",
  emergency: (pct) => `${pct}% vom verbleibenden Netto nach Bafög und Sparplänen.`,
  invest: (pct) => `${pct}% vom verbleibenden Netto nach Bafög und Sparplänen.`,
  donation: (pct) => `${pct}% vom Netto-Einkommen.`,
};

// Each bucket gets a distinct accent so the eye can sort buckets at a glance
// without reading the label first. Kept subtle (10% fill) so it reads as a
// tint, not a decoration competing with the numbers.
const bucketAccents: Record<string, { icon: string; bar: string; badge: string }> = {
  bafoeg: {
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  emergency: {
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  invest: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  donation: {
    icon: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    bar: "bg-pink-500",
    badge: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-400",
  },
  spending: {
    icon: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    bar: "bg-slate-400",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400",
  },
};

function formatIban(iban: string) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

type Props = {
  bucket: AllocationRunBucket;
  config: AllocationBucket;
  hasRecipient: boolean;
  recipientAccounts: { id: number; account_name: string; recipient_name: string; iban: string }[];
  bankAccounts: { iban: string; name: string }[];
  bafoegActive: boolean;
  onTransfer: (runBucketId: number) => void;
  onUpdateConfig: (bucketId: number, updates: Partial<AllocationBucket>) => Promise<void>;
  onAnalyse: () => void;
  transferring: boolean;
};

export function BucketCard({
  bucket,
  config,
  hasRecipient,
  recipientAccounts,
  bankAccounts,
  bafoegActive,
  onTransfer,
  onUpdateConfig,
  onAnalyse,
  transferring,
}: Props) {
  const progress =
    bucket.target_amount > 0
      ? Math.min(100, Math.round((bucket.transferred / bucket.target_amount) * 100))
      : 0;
  const topUp = Math.max(0, bucket.target_amount - bucket.transferred);
  const isInfoOnly = bucket.bucket_type === "spending";
  const isPaid = topUp <= 0 && bucket.target_amount > 0;
  const accent = bucketAccents[bucket.bucket_type] ?? bucketAccents.spending;

  // Percentage is edited locally and only saved on blur / slider release,
  // instead of firing a save on every keystroke or every pixel of drag.
  const [localPct, setLocalPct] = useState(String(config.percentage));
  useEffect(() => setLocalPct(String(config.percentage)), [config.percentage]);

  const [localGoalAmount, setLocalGoalAmount] = useState(
    config.target_amount != null && config.target_amount > 0 ? String(config.target_amount) : "",
  );
  const [localGoalMonths, setLocalGoalMonths] = useState(
    config.target_months != null && config.target_months > 0 ? String(config.target_months) : "",
  );
  useEffect(() => {
    setLocalGoalAmount(
      config.target_amount != null && config.target_amount > 0 ? String(config.target_amount) : "",
    );
    setLocalGoalMonths(
      config.target_months != null && config.target_months > 0 ? String(config.target_months) : "",
    );
  }, [config.target_amount, config.target_months]);

  const commitGoal = () => {
    const amt = localGoalAmount.trim() ? parseFloat(localGoalAmount.replace(",", ".")) : 0;
    const mos = localGoalMonths.trim() ? parseFloat(localGoalMonths.replace(",", ".")) : 0;
    if (amt > 0) {
      void onUpdateConfig(bucket.bucket_id, { target_amount: amt, target_months: null });
    } else if (mos > 0) {
      void onUpdateConfig(bucket.bucket_id, { target_months: mos, target_amount: null });
    } else {
      void onUpdateConfig(bucket.bucket_id, { target_amount: null, target_months: null });
    }
  };

  // Rough live preview of what the percentage translates to in euros,
  // derived from the currently saved target amount.
  const estimatedNetIncome =
    config.percentage > 0 ? bucket.target_amount / (config.percentage / 100) : null;
  const pctNum = parseFloat(localPct);
  const previewAmount =
    estimatedNetIncome !== null ? (estimatedNetIncome * (isNaN(pctNum) ? 0 : pctNum)) / 100 : null;

  const commitPercentage = (value: string) => {
    const num = parseFloat(value);
    const clamped = Math.min(100, Math.max(0, isNaN(num) ? 0 : num));
    setLocalPct(String(clamped));
    if (clamped !== config.percentage) {
      void onUpdateConfig(bucket.bucket_id, { percentage: clamped });
    }
  };

  return (
    <Card className="flex h-full flex-col py-6 transition-shadow hover:shadow-md">
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${accent.icon}`}
            >
              {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-4" />}
            </span>
            <CardTitle className="flex items-center gap-1.5">
              {bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}
              {bucket.bucket_type === "donation" && (
                <HelpButton>
                  Der Spenden-Betrag wird an ein zufällig ausgewähltes Spenden-Konto gesendet.
                  Hinterlege in{" "}
                  <span className="font-semibold">Einstellungen → Empfängerkonten</span> ein Konto
                  und markiere es als Spenden-Konto.
                </HelpButton>
              )}
            </CardTitle>
          </div>
          {!isInfoOnly && (
            <Popover
              onOpenChange={(open) => {
                if (!open) commitPercentage(localPct);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 -mr-2 -mt-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Einstellungen für ${bucketLabels[bucket.bucket_type]}`}
                >
                  <Settings2 className="size-4" />
                </Button>
              </PopoverTrigger>

              <PopoverContent align="end" className="w-80 overflow-hidden p-0">
                {/* Header: icon repeats the card's own accent so the popover
                    reads as "this bucket", not a generic settings sheet */}
                <div className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${accent.icon}`}
                  >
                    {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight">
                      {bucketLabels[bucket.bucket_type]}
                    </p>
                    <p className="text-xs text-muted-foreground leading-tight">
                      Verteilung und Konten anpassen
                    </p>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4">
                  {bucket.bucket_type !== "bafoeg" && (
                    <>
                      {/* Section 1: Verteilung */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                          Verteilung
                        </p>
                        <div className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <Label
                              htmlFor={`pct-${bucket.id}`}
                              className="text-sm font-normal text-foreground"
                            >
                              Anteil vom Netto-Einkommen
                            </Label>
                            <div className="relative shrink-0">
                              <Input
                                id={`pct-${bucket.id}`}
                                type="text"
                                inputMode="decimal"
                                value={localPct}
                                onChange={(e) => setLocalPct(e.target.value)}
                                className="h-8 w-20 bg-background pr-7 text-right text-sm tabular-nums"
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                %
                              </span>
                            </div>
                          </div>
                          {previewAmount !== null && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Info className="size-3 shrink-0" />≈ {formatAmount(previewAmount)}{" "}
                              bei aktuellem Netto-Einkommen
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="h-px bg-border" />

                      {bucket.bucket_type === "emergency" && (
                        <>
                          {/* Section 1.5: Sparziel */}
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                              Sparziel
                            </p>
                            <div className="space-y-2 rounded-lg border bg-muted/20 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <Label
                                  htmlFor={`goal-type-${bucket.id}`}
                                  className="text-sm font-normal text-foreground"
                                >
                                  Festbetrag
                                </Label>
                                <div className="relative shrink-0">
                                  <Input
                                    id={`goal-amount-${bucket.id}`}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="—"
                                    value={localGoalAmount}
                                    onChange={(e) => {
                                      setLocalGoalAmount(e.target.value);
                                      setLocalGoalMonths("");
                                    }}
                                    onBlur={() => commitGoal()}
                                    className="h-8 w-28 bg-background pr-7 text-right text-sm tabular-nums"
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    €
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <Label
                                  htmlFor={`goal-months-${bucket.id}`}
                                  className="text-sm font-normal text-foreground"
                                >
                                  Monatsgehälter
                                </Label>
                                <div className="relative shrink-0">
                                  <Input
                                    id={`goal-months-${bucket.id}`}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="—"
                                    value={localGoalMonths}
                                    onChange={(e) => {
                                      setLocalGoalMonths(e.target.value);
                                      setLocalGoalAmount("");
                                    }}
                                    onBlur={() => commitGoal()}
                                    className="h-8 w-20 bg-background pr-7 text-right text-sm tabular-nums"
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    ×
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Leer lassen = kein Sparziel. Die Felder schließen sich gegenseitig
                                aus.
                              </p>
                            </div>
                          </div>

                          <div className="h-px bg-border" />
                        </>
                      )}
                    </>
                  )}

                  {/* Section 2: Konten — recipient and sender grouped
                      together with directional icons (in / out) so the two
                      fields aren't just two identical-looking dropdowns */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      Konten
                    </p>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <ArrowDownToLine className="size-3" />
                        Empfänger
                      </Label>
                      {bucket.bucket_type === "donation" ? (
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          Wird zufällig aus den Spendenkonten ausgewählt
                        </p>
                      ) : (
                        <SearchableSelect
                          height={15}
                          value={
                            config.recipient_account_id != null
                              ? String(config.recipient_account_id)
                              : "none"
                          }
                          onValueChange={(v) => {
                            onUpdateConfig(bucket.bucket_id, {
                              recipient_account_id: v === "none" ? null : Number(v),
                            });
                          }}
                          options={recipientAccounts.map((r) => ({
                            value: String(r.id),
                            label: `${r.account_name} ${r.recipient_name} ${r.iban}`,
                          }))}
                          placeholder="Kein Konto"
                          searchPlaceholder="Konto suchen…"
                          emptyText="Kein Empfängerkonto gefunden"
                          showNoneOption
                          noneLabel="Kein Konto"
                          noneValue="none"
                          renderOption={(option) => {
                            const r = recipientAccounts.find((x) => x.id === Number(option.value));
                            if (!r) return <span>{option.label}</span>;
                            return (
                              <div className="flex flex-col gap-0.5 py-1">
                                <span className="font-medium text-sm leading-tight">
                                  {r.account_name}
                                </span>
                                <span className="text-xs text-muted-foreground leading-tight">
                                  {r.recipient_name}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground/70 leading-tight">
                                  {formatIban(r.iban)}
                                </span>
                              </div>
                            );
                          }}
                          renderSelected={(option) => {
                            const r = recipientAccounts.find((x) => x.id === Number(option.value));
                            if (!r) return <span>{option.label}</span>;
                            return (
                              <div className="flex flex-col items-start gap-0">
                                <span className="text-sm leading-tight">{r.account_name}</span>
                                <span className="font-mono text-[11px] text-muted-foreground leading-tight">
                                  {formatIban(r.iban)}
                                </span>
                              </div>
                            );
                          }}
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <ArrowUpFromLine className="size-3" />
                        Absender
                      </Label>
                      <SearchableSelect
                        height={15}
                        value={config.sender_iban ?? ""}
                        onValueChange={(v) => {
                          onUpdateConfig(bucket.bucket_id, { sender_iban: v || null });
                        }}
                        options={bankAccounts.map((a) => ({
                          value: a.iban,
                          label: `${a.name} ${a.iban}`,
                        }))}
                        placeholder="Konto auswählen"
                        searchPlaceholder="Konto suchen…"
                        emptyText="Kein Konto gefunden"
                        renderOption={(option) => {
                          const a = bankAccounts.find((x) => x.iban === option.value);
                          if (!a) return <span>{option.label}</span>;
                          return (
                            <div className="flex flex-col gap-0.5 py-1">
                              <span className="font-medium text-sm leading-tight">{a.name}</span>
                              <span className="font-mono text-xs text-muted-foreground/70 leading-tight">
                                {formatIban(a.iban)}
                              </span>
                            </div>
                          );
                        }}
                        renderSelected={(option) => {
                          const a = bankAccounts.find((x) => x.iban === option.value);
                          if (!a) return <span>{option.label}</span>;
                          return (
                            <div className="flex flex-col items-start gap-0">
                              <span className="text-sm leading-tight">{a.name}</span>
                              <span className="font-mono text-[11px] text-muted-foreground leading-tight">
                                {formatIban(a.iban)}
                              </span>
                            </div>
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <CardDescription>
          {bucket.bucket_type === "bafoeg"
            ? null
            : ((bafoegActive ? bucketDescriptionsBafoeg : bucketDescriptions)[bucket.bucket_type]?.(
                config.percentage,
              ) ?? `${config.percentage}% vom Netto-Einkommen`)}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{isInfoOnly ? "Verfügbar" : "Monatsziel"}</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatAmount(bucket.target_amount)}
          </span>
        </div>

        {isInfoOnly && bucket.bucket_type === "spending" && bucket.spent !== undefined ? (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatAmount(bucket.spent)} ausgegeben</span>
              <span
                className={`font-medium tabular-nums ${bucket.spent > bucket.target_amount ? "text-red-500" : ""}`}
              >
                {Math.min(100, Math.round((bucket.spent / bucket.target_amount) * 100))}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${bucket.spent > bucket.target_amount ? "bg-red-500" : accent.bar}`}
                style={
                  {
                    width: `${Math.min(100, Math.round((bucket.spent / bucket.target_amount) * 100))}%`,
                    minWidth: bucket.spent > 0 ? "8px" : undefined,
                  } as React.CSSProperties
                }
              />
            </div>
          </>
        ) : (
          !isInfoOnly &&
          !(bucket.bucket_type === "emergency" && bucket.goal_amount != null) && (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatAmount(bucket.transferred)} überwiesen</span>
                <span className="font-medium tabular-nums">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${accent.bar}`}
                  style={
                    {
                      width: `${progress}%`,
                      minWidth: progress > 0 ? "8px" : undefined,
                    } as React.CSSProperties
                  }
                />
              </div>
            </>
          )
        )}

        {bucket.bucket_type === "emergency" && bucket.goal_amount != null && bucket.saved_total != null && (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${accent.bar}`}
                  style={{
                    width: `${bucket.goal_amount > 0 ? Math.min(100, Math.round((bucket.saved_total / bucket.goal_amount) * 100)) : 0}%`,
                    minWidth: bucket.saved_total > 0 ? "8px" : undefined,
                  } as React.CSSProperties}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {formatAmount(bucket.saved_total)} von {formatAmount(bucket.goal_amount)} gespart
                </span>
              </div>
              {bucket.months_left != null && bucket.months_left > 0 && (
                <div className="flex flex-col text-xs mt-2">
                  <span className="text-muted-foreground">Noch nötig bei aktueller Sparrate</span>
                  <span className="font-medium tabular-nums">
                    {bucket.months_left >= 12
                      ? `${Math.floor(bucket.months_left / 12)} Jahre, ${bucket.months_left % 12} Monate`
                      : `${bucket.months_left} ${bucket.months_left === 1 ? "Monat" : "Monate"}`}
                  </span>
                </div>
              )}
            </div>
          )}

        {bucketTags[bucket.bucket_type] && (
          <p className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <HashIcon className="size-3" />
            {bucketTags[bucket.bucket_type]}
          </p>
        )}

        {bucket.bucket_type === "donation" && (
          <button
            onClick={onAnalyse}
            className="flex cursor-pointer items-center gap-1.5 self-start rounded-md border border-border/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors mt-1"
          >
            <TrendingUp className="size-3.5" />
            Analyse
          </button>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {isInfoOnly ? null : isPaid ? (
            <div
              className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${accent.badge}`}
            >
              <CheckCircle2 className="size-4" />
              Monatsziel erreicht
            </div>
          ) : !hasRecipient ? (
            <div className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
              Kein Empfängerkonto ausgewählt. Bitte in den Einstellungen hinzufügen
            </div>
          ) : (
            <Button
              size="sm"
              disabled={transferring}
              onClick={() => onTransfer(bucket.id)}
              className="w-full"
            >
              {transferring ? "Wird gesendet…" : `${formatAmount(topUp)} jetzt überweisen`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
