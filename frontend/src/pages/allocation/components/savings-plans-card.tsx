import { useState } from "react";
import {
  Car,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  HashIcon,
  Home,
  Info,
  Loader2,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plane,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PayoutSlider } from "./payout-slider";
import { SavingsPlanDatePickerInput } from "./savings-plan-date-picker-input";
import { SearchableSelect } from "@/components/searchable-select";
import {
  createSavingsPlan,
  deleteSavingsPlan,
  updateSavingsPlan,
  executeSavingsPlanTransfer,
  type SavingsPlan,
} from "@/lib/allocation";
import { type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { formatAmount } from "@/lib/utils/format";
import { formatDateInputValue, parseIsoDate } from "../utils";

type Props = {
  plans: SavingsPlan[];
  savingsTotal: number;
  currentMonth: string;
  onRefresh: () => void;
  onTransfer: (plan: SavingsPlan, customAmount?: number) => void;
  recipientAccounts: RecipientAccountRecord[];
  bankAccounts: { iban: string; name: string }[];
  autoHiddenPlanIds: number[];
};

function formatIban(iban: string) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

function planIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("urlaub") || n.includes("reise")) return Plane;
  if (n.includes("auto") || n.includes("car")) return Car;
  if (n.includes("haus") || n.includes("wohnung")) return Home;
  if (n.includes("studium") || n.includes("uni")) return GraduationCap;
  return PiggyBank;
}

type FormValues = {
  name: string;
  tag: string;
  recipientName: string;
  recipientIban: string;
  recipientBic: string;
  targetAmount: string;
  targetDate: Date | null;
  senderIban: string;
};

const emptyForm: FormValues = {
  name: "",
  tag: "",
  recipientName: "",
  recipientIban: "",
  recipientBic: "",
  targetAmount: "",
  targetDate: null,
  senderIban: "",
};

function isFormValid(v: FormValues) {
  return v.name.trim() && v.tag.trim() && v.recipientName.trim() && v.recipientIban.trim() && v.senderIban.trim();
}

// Shared field layout for both the create and edit dialogs, so the two
// flows look and behave identically instead of one being an inline grid
// and the other a proper form.
function PlanFormFields({
  values,
  onChange,
  recipientAccounts,
  bankAccounts,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  recipientAccounts: RecipientAccountRecord[];
  bankAccounts: { iban: string; name: string }[];
}) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    onChange({ ...values, [key]: value });

  const selectedRecipientId =
    recipientAccounts.find(
      (r) =>
        r.recipient_name === values.recipientName &&
        r.iban === values.recipientIban &&
        (r.bic ?? "") === values.recipientBic,
    )?.id ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="z. B. Urlaub"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-tag">
            Tag <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-tag"
            value={values.tag}
            onChange={(e) => set("tag", e.target.value)}
            placeholder="z. B. griechenland"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan-amount">
            Zielbetrag <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="plan-amount"
              value={values.targetAmount}
              onChange={(e) => set("targetAmount", e.target.value)}
              type="text"
              inputMode="decimal"
              placeholder="optional"
              className="pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>
            Zieldatum <span className="text-destructive">*</span>
          </Label>
          <SavingsPlanDatePickerInput
            defaultValue={values.targetDate ? formatDateInputValue(values.targetDate) : null}
            onChange={(d) => set("targetDate", d)}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-xs font-medium text-muted-foreground">Zahlungsempfänger</p>

        <div className="space-y-1.5">
          <Label>Empfängerkonto übernehmen</Label>
          <SearchableSelect
            height={15}
            value={selectedRecipientId != null ? String(selectedRecipientId) : "manual"}
            onValueChange={(v) => {
              if (v === "manual") return;
              const r = recipientAccounts.find((a) => a.id === Number(v));
              if (r) {
                onChange({
                  ...values,
                  recipientName: r.recipient_name,
                  recipientIban: r.iban,
                  recipientBic: r.bic ?? "",
                });
              }
            }}
            options={recipientAccounts.map((r) => ({
              value: String(r.id),
              label: `${r.account_name} ${r.recipient_name} ${r.iban}`,
            }))}
            placeholder="Kein Eintrag (manuelle Eingabe)"
            searchPlaceholder="Konto suchen…"
            emptyText="Kein Empfängerkonto gefunden"
            showNoneOption
            noneLabel="Kein Eintrag (manuelle Eingabe)"
            noneValue="manual"
            renderOption={(option) => {
              const a = recipientAccounts.find((x) => x.id === Number(option.value));
              if (!a) return <span>{option.label}</span>;
              return (
                <div className="flex flex-col gap-0.5 py-1">
                  <span className="font-medium text-sm leading-tight">{a.account_name}</span>
                  <span className="text-xs text-muted-foreground leading-tight">
                    {a.recipient_name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground/70 leading-tight">
                    {formatIban(a.iban)}
                  </span>
                </div>
              );
            }}
            renderSelected={(option) => {
              const a = recipientAccounts.find((x) => x.id === Number(option.value));
              if (!a) return <span>{option.label}</span>;
              return (
                <div className="flex flex-col items-start gap-0">
                  <span className="text-sm leading-tight">{a.account_name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground leading-tight">
                    {formatIban(a.iban)}
                  </span>
                </div>
              );
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="plan-recipient">
            Empfänger <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan-recipient"
            value={values.recipientName}
            onChange={(e) => set("recipientName", e.target.value)}
            placeholder="Name des Kontoinhabers"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="plan-iban">
              IBAN <span className="text-destructive">*</span>
            </Label>
            <Input
              id="plan-iban"
              value={values.recipientIban}
              onChange={(e) => set("recipientIban", e.target.value)}
              placeholder="DE…"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-bic">BIC</Label>
            <Input
              id="plan-bic"
              value={values.recipientBic}
              onChange={(e) => set("recipientBic", e.target.value)}
              placeholder="optional"
              className="font-mono"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Wird benötigt, damit du direkt aus der App auf diesen Sparplan einzahlen kannst.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-xs font-medium text-muted-foreground">Absenderkonto <span className="text-destructive">*</span></p>
        <SearchableSelect
          height={15}
          value={values.senderIban}
          onValueChange={(v) => set("senderIban", v)}
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
            if (!a) return <span className="text-muted-foreground">Kein Konto</span>;
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
        <p className="text-xs text-muted-foreground">
          Von welchem Konto soll die Zahlung erfolgen?
        </p>
      </div>
    </div>
  );
}

export function SavingsPlansCard({
  plans,
  savingsTotal,
  currentMonth,
  onRefresh,
  onTransfer,
  recipientAccounts,
  bankAccounts,
  autoHiddenPlanIds,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<FormValues>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingPlan, setEditingPlan] = useState<SavingsPlan | null>(null);
  const [editValues, setEditValues] = useState<FormValues>(emptyForm);
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingPlan, setDeletingPlan] = useState<SavingsPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [sliderValues, setSliderValues] = useState<Record<number, number>>({});

  const handleCreate = async () => {
    if (!isFormValid(createValues)) {
      setCreateError("Bitte fülle alle Pflichtfelder (*) aus.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createSavingsPlan({
        name: createValues.name.trim(),
        tag: createValues.tag
          .trim()
          .toLowerCase()
          .replace(/^tag\./, ""),
        target_amount: parseFloat(createValues.targetAmount.replace(",", ".")) || 0,
        target_date: formatDateInputValue(createValues.targetDate ?? undefined),
        target_recipient_name: createValues.recipientName.trim(),
        target_recipient_iban: createValues.recipientIban.trim().toUpperCase(),
        target_recipient_bic: createValues.recipientBic.trim().toUpperCase() || null,
        sender_iban: createValues.senderIban.trim() || null,
      });
      setCreateValues(emptyForm);
      setCreateOpen(false);
      onRefresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Sparplan konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = (plan: SavingsPlan) => {
    setMenuOpenId(null);
    setEditError(null);
    setEditingPlan(plan);
    setEditValues({
      name: plan.name,
      tag: plan.tag ?? "",
      recipientName: plan.target_recipient_name ?? "",
      recipientIban: plan.target_recipient_iban ?? "",
      recipientBic: plan.target_recipient_bic ?? "",
      targetAmount: plan.target_amount != null ? String(plan.target_amount) : "",
      targetDate: parseIsoDate(plan.target_date) ?? null,
      senderIban: (plan as Record<string, unknown>).sender_iban as string ?? "",
    });
  };

  const handleUpdate = async () => {
    if (!editingPlan) return;
    if (!isFormValid(editValues)) {
      setEditError("Bitte fülle alle Pflichtfelder (*) aus.");
      return;
    }
    setUpdating(true);
    setEditError(null);
    try {
      await updateSavingsPlan(editingPlan.id, {
        name: editValues.name.trim(),
        tag: editValues.tag
          .trim()
          .toLowerCase()
          .replace(/^tag\./, ""),
        target_recipient_name: editValues.recipientName.trim(),
        target_recipient_iban: editValues.recipientIban.trim().toUpperCase(),
        target_recipient_bic: editValues.recipientBic.trim().toUpperCase() || null,
        target_amount: editValues.targetAmount
          ? parseFloat(editValues.targetAmount.replace(",", "."))
          : null,
        target_date: editValues.targetDate ? formatDateInputValue(editValues.targetDate) : null,
        sender_iban: editValues.senderIban.trim() || null,
      });
      if (autoHiddenPlanIds.includes(editingPlan.id)) {
        await updateSavingsPlan(editingPlan.id, { is_visible: true });
      }
      setEditingPlan(null);
      onRefresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Sparplan konnte nicht gespeichert werden.");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPlan) return;
    setDeleting(true);
    try {
      await deleteSavingsPlan(deletingPlan.id);
      setDeletingPlan(null);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleVisibility = async (plan: SavingsPlan) => {
    setMenuOpenId(null);
    setTogglingId(plan.id);
    try {
      await updateSavingsPlan(plan.id, { is_visible: !plan.is_visible });
      onRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Card className="py-6">
      <CardHeader>
        <div className="flex justify-between">
          <div className="flex flex-col">
            <CardTitle>Individuelle Sparpläne</CardTitle>
            <CardDescription>
              Lege eigene Sparziele an, z. B. Urlaub oder ein neues Auto.
            </CardDescription>
          </div>
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) {
                setCreateValues(emptyForm);
                setCreateError(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sparplan anlegen</DialogTitle>
                <DialogDescription>
                  Lege ein eigenes Sparziel an, z. B. für einen Urlaub oder eine größere
                  Anschaffung.
                </DialogDescription>
              </DialogHeader>
              <PlanFormFields
                values={createValues}
                onChange={setCreateValues}
                recipientAccounts={recipientAccounts}
                bankAccounts={bankAccounts}
              />
              {createError && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <TriangleAlert className="size-4 shrink-0" /> {createError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Abbrechen
                </Button>
                <Button onClick={handleCreate} disabled={creating || !createValues.senderIban.trim()}>
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Sparplan anlegen
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Sparplan anlegen
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {plans.length === 0 && (
          <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            Noch keine Sparpläne angelegt.
          </div>
        )}

        {autoHiddenPlanIds.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ⚠ {autoHiddenPlanIds.length} Sparplan{autoHiddenPlanIds.length !== 1 ? " wurden" : " wurde"} ausgeblendet - Budget nicht ausreichend. Älteste Sparpläne haben Vorrang.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const Icon = planIcon(plan.name);
            const isDeleting = deletingPlan?.id === plan.id && deleting;
            const isToggling = togglingId === plan.id;
            const targetAmount = plan.target_amount ?? 0;
            const safeTarget = targetAmount > 0 ? targetAmount : 1;
            const savedTotal = plan.saved_amount ?? 0;
            const thisMonthAmount = plan.this_month ?? 0;
            const einzahlungenTotal = plan.saved_einzahlungen ?? 0;
            const monthEinzahlungen = plan.month_einzahlungen ?? 0;
            const beforeMonthEinzahlungen = Math.max(0, einzahlungenTotal - monthEinzahlungen);
            const beforeMonthPct = Math.min(
              100,
              Math.max(0, (beforeMonthEinzahlungen / safeTarget) * 100),
            );
            const monthPct = Math.min(100, Math.max(0, (monthEinzahlungen / safeTarget) * 100));
            const entnahmenTotal = plan.saved_entnahmen ?? 0;
            const entnahmenPct = Math.min(100, Math.max(0, (entnahmenTotal / safeTarget) * 100));
            const savedTotalPct = Math.min(100, Math.max(0, (savedTotal / safeTarget) * 100));
            const isVisible = plan.is_visible;
            const hasPaymentData = !!(plan.target_recipient_name && plan.target_recipient_iban);
            const requiredRate = plan.required_monthly_rate;
            const topUp = requiredRate != null ? Math.max(0, requiredRate - thisMonthAmount) : 0;
            const remainingToSave =
              targetAmount > 0 ? Math.max(0, targetAmount - savedTotal) : topUp;
            const planPaid = requiredRate != null && topUp <= 0;
            const isAutoHidden = autoHiddenPlanIds.includes(plan.id);

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col gap-3 rounded-lg border p-4 transition-opacity ${isVisible ? "" : "opacity-50"}`}
              >
                {isAutoHidden && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-amber-50/80 text-center text-xs text-amber-700 backdrop-blur-[1px] dark:bg-amber-950/70 dark:text-amber-300">
                    <Popover
                      open={menuOpenId === plan.id}
                      onOpenChange={(open) => setMenuOpenId(open ? plan.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 z-20 size-7 cursor-pointer text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
                          aria-label={`Optionen für ${plan.name}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-48 p-1">
                        <Button
                          variant="ghost"
                          className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm"
                          onClick={() => openEditDialog(plan)}
                        >
                          <Pencil className="size-4" /> Bearbeiten
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={isToggling}
                          className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm disabled:cursor-not-allowed"
                          onClick={() => handleToggleVisibility(plan)}
                        >
                          {isToggling ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Eye className="size-4" />
                          )}{" "}
                          Einblenden
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={isDeleting}
                          className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm text-red-600 hover:text-red-700 disabled:cursor-not-allowed"
                          onClick={() => setDeletingPlan(plan)}
                        >
                          {isDeleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}{" "}
                          Löschen
                        </Button>
                      </PopoverContent>
                    </Popover>
                    Ausgeblendet - Budget nicht ausreichend
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-medium">{plan.name}</span>
                  </div>

                  {!isAutoHidden && (
                  <Popover
                    open={menuOpenId === plan.id}
                    onOpenChange={(open) => setMenuOpenId(open ? plan.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                        aria-label={`Optionen für ${plan.name}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48 p-1">
                      <Button
                        variant="ghost"
                        className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm"
                        onClick={() => openEditDialog(plan)}
                      >
                        <Pencil className="size-4" /> Bearbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={isToggling}
                        className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm disabled:cursor-not-allowed"
                        onClick={() => handleToggleVisibility(plan)}
                      >
                        {isToggling ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : isVisible ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                        {isVisible ? "Ausblenden" : "Einblenden"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setMenuOpenId(null);
                          setDeletingPlan(plan);
                        }}
                      >
                        <Trash2 className="size-4" /> Löschen
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatAmount(savedTotal)}{" "}
                      <span className="font-normal text-muted-foreground">
                        von {formatAmount(targetAmount)}
                      </span>
                    </span>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {Math.round(savedTotalPct)}%
                    </span>
                  </div>
                  <div className="flex h-2 w-full gap-1">
                    {beforeMonthPct > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full rounded-full bg-emerald-500/40 cursor-pointer"
                            style={{ width: `${beforeMonthPct}%`, minWidth: beforeMonthPct > 0 ? "8px" : undefined } as React.CSSProperties}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {formatAmount(beforeMonthEinzahlungen)} eingezahlt (vorherige Monate)
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {monthPct > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full rounded-full bg-emerald-500 cursor-pointer"
                            style={{ width: `${monthPct}%`, minWidth: monthPct > 0 ? "8px" : undefined } as React.CSSProperties}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {formatAmount(monthEinzahlungen)} eingezahlt (diesen Monat)
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {entnahmenPct > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full rounded-full bg-orange-500/20 cursor-pointer"
                            style={{ width: `${entnahmenPct}%`, minWidth: entnahmenPct > 0 ? "8px" : undefined } as React.CSSProperties}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {formatAmount(entnahmenTotal)} entnommen
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <div className="h-full flex-1 rounded-full bg-muted" />
                  </div>
                  {monthEinzahlungen > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatAmount(monthEinzahlungen)} diesen Monat eingezahlt
                    </p>
                  )}
                  {entnahmenTotal > 0 && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      {formatAmount(entnahmenTotal)} entnommen
                      {plan.month_entnahmen > 0 &&
                        ` (${formatAmount(plan.month_entnahmen)} diesen Monat)`}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <p className="text-muted-foreground">Zieldatum</p>
                    <p className="font-medium">
                      {plan.target_date
                        ? new Date(plan.target_date + "T00:00:00").toLocaleDateString("de-DE")
                        : "offen"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nötige Rate/Monat</p>
                    <p className="font-medium">
                      {requiredRate == null ? "offen" : formatAmount(requiredRate)}
                    </p>
                  </div>
                </div>
                {plan.income_events_left != null && (
                  <p className="text-xs text-muted-foreground">
                    {plan.income_events_left} erwartete Einkommen bis zum Zieldatum
                  </p>
                )}

                {hasPaymentData ? (
                  <div className="space-y-0.5 rounded-md border px-3 py-2 text-xs">
                    <p className="font-medium">{plan.target_recipient_name}</p>
                    <p className="truncate font-mono text-muted-foreground">
                      {formatIban(plan.target_recipient_iban!)}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-700 dark:text-orange-400">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>Zahlungsdaten fehlen. Bitte Empfänger und Ziel-IBAN hinterlegen.</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Der Tag{" "}
                  <span className="inline-flex items-start gap-0.5 py-0.5 px-2 bg-muted rounded-full font-mono text-xs font-semibold text-foreground">
                    {plan.tag?.startsWith("tag.") ? plan.tag : `tag.${plan.tag}`}
                  </span>{" "}
                  muss im Verwendungszweck enthalten sein, damit die Zahlung korrekt zugeordnet
                  wird. Bei Zahlung über „jetzt zahlen“ wird er automatisch ergänzt.
                </p>

                <div className="mt-auto space-y-3">
                  {planPaid ? (
                    <div className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" /> Monatsziel erreicht
                    </div>
                  ) : hasPaymentData && requiredRate != null ? (
                    <>
                      <PayoutSlider
                        value={sliderValues[plan.id] ?? topUp}
                        max={remainingToSave}
                        anchorValue={topUp}
                        onChange={(v) =>
                          setSliderValues((prev) => ({
                            ...prev,
                            [plan.id]: v,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={() => onTransfer(plan, sliderValues[plan.id] ?? topUp)}
                      >
                        {`${formatAmount(sliderValues[plan.id] ?? topUp)} jetzt zahlen`}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!hasPaymentData}
                      className="w-full"
                      onClick={() => onTransfer(plan)}
                    >
                      {`${formatAmount(topUp)} jetzt zahlen`}
                    </Button>
                  )}
                </div>
                {isDeleting && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Wird gelöscht…
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog
        open={!!editingPlan}
        onOpenChange={(open) => {
          if (!open) setEditingPlan(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sparplan bearbeiten</DialogTitle>
          </DialogHeader>
          <PlanFormFields
            values={editValues}
            onChange={setEditValues}
            recipientAccounts={recipientAccounts}
            bankAccounts={bankAccounts}
          />
          {editError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" /> {editError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditingPlan(null)} disabled={updating}>
              Abbrechen
            </Button>
            <Button onClick={handleUpdate} disabled={updating || !editValues.senderIban.trim()}>
              {updating && <Loader2 className="size-4 animate-spin" />}
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletingPlan}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingPlan(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sparplan löschen?</DialogTitle>
            <DialogDescription>
              „{deletingPlan?.name}“ wird endgültig gelöscht. Bereits gespeicherte Fortschritte
              gehen verloren. Das kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setDeletingPlan(null)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Endgültig löschen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
