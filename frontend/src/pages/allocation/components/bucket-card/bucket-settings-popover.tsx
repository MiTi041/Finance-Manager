import { useEffect, useRef, useState } from "react";
import {
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Heart,
  Wallet,
  Settings2,
  ArrowDownToLine,
  ArrowUpFromLine,
  HashIcon,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/date-picker";
import { formatAmount } from "@/lib/utils/format";
import { fetchBafoegConfig, updateBafoegConfig } from "@/lib/allocation";
import type { AllocationBucket, AllocationRunBucket } from "@/lib/allocation";

const bucketLabels: Record<string, string> = {
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
  bafoeg: "tag.bafoegschulden",
  emergency: "tag.notfallfonds",
  invest: "tag.investieren",
  donation: "tag.spenden",
};

function formatIban(iban: string) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

type Props = {
  bucket: AllocationRunBucket;
  config: AllocationBucket;
  accent: { icon: string; bar: string; badge: string; barMuted: string };
  recipientAccounts: { id: number; account_name: string; recipient_name: string; iban: string }[];
  bankAccounts: { iban: string; name: string; bankKey: string }[];
  canTransferMap: Map<string, boolean>;
  onUpdateConfig: (bucketId: number, updates: Partial<AllocationBucket>) => Promise<void>;
  onRefresh?: () => void;
};

export function BucketSettingsPopover(props: Props) {
  const { bucket, config, accent, recipientAccounts, bankAccounts, canTransferMap, onUpdateConfig, onRefresh } = props;

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

  const [bafoegConfig, setBafoegConfig] = useState<{
    current_balance: number;
    anlagezinsen: number;
    interest_rate: number;
    payout_date: string | null;
    total_debt: number;
  } | null>(null);
  const [localBafoegBalance, setLocalBafoegBalance] = useState("");
  const [zinsInput, setZinsInput] = useState("");
  const [localBafoegRate, setLocalBafoegRate] = useState("");
  const [localBafoegPayoutDate, setLocalBafoegPayoutDate] = useState("");
  const bafoegConfigFetched = useRef(false);

  useEffect(() => {
    if (bucket.bucket_type !== "bafoeg" || bafoegConfigFetched.current) return;
    bafoegConfigFetched.current = true;
    fetchBafoegConfig().then((cfg) => {
      setBafoegConfig(cfg);
      setLocalBafoegBalance(cfg.current_balance > 0 ? String(cfg.current_balance) : "");
      setLocalBafoegRate(cfg.interest_rate > 0 ? String(cfg.interest_rate) : "");
      setLocalBafoegPayoutDate(cfg.payout_date ?? "");
    });
  }, [bucket.bucket_type]);

  const commitBafoegConfig = (nextPayoutDate = localBafoegPayoutDate) => {
    const balance = parseFloat(localBafoegBalance.replace(",", ".")) || 0;
    const rate = parseFloat(localBafoegRate.replace(",", ".")) || 2.0;
    const payout = nextPayoutDate.trim() || null;
    if (
      bafoegConfig &&
      balance === bafoegConfig.current_balance &&
      rate === bafoegConfig.interest_rate &&
      payout === bafoegConfig.payout_date
    ) {
      return;
    }
    updateBafoegConfig({
      current_balance: balance,
      interest_rate: rate,
      payout_date: payout,
    }).then((cfg) => {
      setBafoegConfig(cfg);
      onRefresh?.();
    });
  };

  const addZins = () => {
    const amt = parseFloat(zinsInput.replace(",", "."));
    if (!bafoegConfig || isNaN(amt) || amt <= 0) return;
    const next = Math.round((bafoegConfig.anlagezinsen + amt) * 100) / 100;
    setZinsInput("");
    updateBafoegConfig({ anlagezinsen: next }).then((cfg) => {
      setBafoegConfig(cfg);
      onRefresh?.();
    });
  };

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

      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.closest("[data-searchable-select-content]")
          ) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full ${accent.icon}`}
          >
            {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">
              {bucketLabels[bucket.bucket_type]}
            </p>
            <p className="text-xs text-muted-foreground leading-tight">
              Verteilung und Konten anpassen
            </p>
          </div>
          {bucketTags[bucket.bucket_type] && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground/80">
              <HashIcon className="size-2.5" />
              {bucketTags[bucket.bucket_type]}
            </span>
          )}
        </div>

        <div className="space-y-4 px-4 py-4">
          {bucket.bucket_type === "bafoeg" ? (
            <>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Bafög-Rücklage
                </p>
                <div className="space-y-2 rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor={`bafoeg-balance-${bucket.id}`}
                      className="text-sm font-normal text-foreground"
                    >
                      Aktuelles Guthaben
                    </Label>
                    <div className="relative shrink-0">
                      <Input
                        id={`bafoeg-balance-${bucket.id}`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={localBafoegBalance}
                        onChange={(e) => setLocalBafoegBalance(e.target.value)}
                        onBlur={() => commitBafoegConfig()}
                        className="h-8 w-28 bg-background pr-7 text-right text-sm tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        €
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor={`bafoeg-rate-${bucket.id}`}
                      className="text-sm font-normal text-foreground"
                    >
                      Zinssatz
                    </Label>
                    <div className="relative shrink-0">
                      <Input
                        id={`bafoeg-rate-${bucket.id}`}
                        type="text"
                        inputMode="decimal"
                        placeholder="2.0"
                        value={localBafoegRate}
                        onChange={(e) => setLocalBafoegRate(e.target.value)}
                        onBlur={() => commitBafoegConfig()}
                        className="h-8 w-20 bg-background pr-7 text-right text-sm tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-normal text-foreground">Zieldatum</Label>
                    <DatePicker
                      className="w-36"
                      value={
                        localBafoegPayoutDate
                          ? new Date(localBafoegPayoutDate + "T00:00:00")
                          : null
                      }
                      onChange={(d) => {
                        const s = d ? d.toISOString().slice(0, 10) : "";
                        setLocalBafoegPayoutDate(s);
                        commitBafoegConfig(s);
                      }}
                    />
                  </div>
                  {bafoegConfig && (
                    <p className="text-xs text-muted-foreground">
                      Ziel: {formatAmount(bafoegConfig.total_debt)} bis{" "}
                      {bafoegConfig.payout_date
                        ? new Date(
                            bafoegConfig.payout_date + "T00:00:00",
                          ).toLocaleDateString("de-DE")
                        : "offen"}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Zinsen
                </p>
                <div className="space-y-2 rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-normal text-foreground">
                      Bisher erhaltene Zinsen
                    </Label>
                    <span className="text-sm tabular-nums">
                      {formatAmount(bafoegConfig?.anlagezinsen ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor={`bafoeg-zins-add-${bucket.id}`}
                      className="text-sm font-normal text-foreground"
                    >
                      Neue Zinszahlung
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <div className="relative shrink-0">
                        <Input
                          id={`bafoeg-zins-add-${bucket.id}`}
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={zinsInput}
                          onChange={(e) => setZinsInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addZins();
                            }
                          }}
                          className="h-8 w-24 bg-background pr-7 text-right text-sm tabular-nums"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          €
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={addZins}>
                        + Hinzufügen
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-px bg-border" />
            </>
          ) : (
            <>
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
                      <Info className="size-3 shrink-0" />≈ {formatAmount(previewAmount)} bei aktuellem Netto-Einkommen
                    </p>
                  )}
                </div>
              </div>

              <div className="h-px bg-border" />

              {bucket.bucket_type === "emergency" && (
                <>
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
                      <div className="flex items-center gap-3 py-0.5">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                          oder
                        </span>
                        <div className="h-px flex-1 bg-border" />
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
                        Leer lassen = kein Sparziel
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-border" />
                </>
              )}
            </>
          )}

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
                      ? `empf:${config.recipient_account_id}`
                      : config.recipient_iban != null
                        ? `bank:${config.recipient_iban}`
                        : "none"
                  }
                  onValueChange={(v) => {
                    if (v === "none") {
                      onUpdateConfig(bucket.bucket_id, { recipient_account_id: null, recipient_iban: null });
                    } else if (v.startsWith("bank:")) {
                      onUpdateConfig(bucket.bucket_id, { recipient_iban: v.slice(5), recipient_account_id: null });
                    } else if (v.startsWith("empf:")) {
                      onUpdateConfig(bucket.bucket_id, { recipient_account_id: Number(v.slice(5)), recipient_iban: null });
                    }
                  }}
                  options={[
                    ...recipientAccounts.map((r) => ({
                      value: `empf:${r.id}`,
                      label: `${r.account_name} ${r.recipient_name} ${r.iban}`,
                      _type: "empf" as const,
                    })),
                    ...bankAccounts
                      .filter((a) => a.iban !== config.sender_iban)
                      .map((a) => ({
                        value: `bank:${a.iban}`,
                        label: `${a.name} ${a.iban}`,
                        _type: "bank" as const,
                      })),
                  ]}
                  placeholder="Kein Konto"
                  searchPlaceholder="Konto suchen…"
                  emptyText="Kein Empfängerkonto gefunden"
                  showNoneOption
                  noneLabel="Kein Konto"
                  noneValue="none"
                  renderOption={(option) => {
                    const isBank = option.value.startsWith("bank:");
                    if (isBank) {
                      const a = bankAccounts.find((x) => x.iban === option.value.slice(5));
                      if (!a) return <span>{option.label}</span>;
                      return (
                        <div className="flex flex-col gap-0.5 py-1">
                          <span className="font-medium text-sm leading-tight">{a.name}</span>
                          <span className="text-xs text-muted-foreground leading-tight">Eigenes Konto</span>
                          <span className="font-mono text-xs text-muted-foreground/70 leading-tight">
                            {formatIban(a.iban)}
                          </span>
                        </div>
                      );
                    }
                    const r = recipientAccounts.find((x) => x.id === Number(option.value.slice(5)));
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
                    const isBank = option.value.startsWith("bank:");
                    if (isBank) {
                      const a = bankAccounts.find((x) => x.iban === option.value.slice(5));
                      if (!a) return <span>{option.label}</span>;
                      return (
                        <div className="flex flex-col items-start gap-0">
                          <span className="text-sm leading-tight">{a.name}</span>
                          <span className="font-mono text-[11px] text-muted-foreground leading-tight">
                            {formatIban(a.iban)}
                          </span>
                        </div>
                      );
                    }
                    const r = recipientAccounts.find((x) => x.id === Number(option.value.slice(5)));
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
                options={bankAccounts
                  .filter((a) => canTransferMap.get(a.bankKey) !== false && a.iban !== config.recipient_iban)
                  .map((a) => ({
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
  );
}
