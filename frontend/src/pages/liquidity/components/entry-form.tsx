import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LiquidityEntryInput, LiquidityKind } from "@/lib/liquidity";
import { evalArithmetic } from "@/lib/utils/arithmetic";
import { formatAmount } from "@/lib/utils/format";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-9 items-center rounded-md bg-muted p-0.5 text-xs"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-8 cursor-pointer rounded px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: LiquidityEntryInput;
  submitLabel: string;
  onSubmit: (input: LiquidityEntryInput) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [kind, setKind] = useState<LiquidityKind>(initial?.kind ?? "expense");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const value = evalArithmetic(amount);
  const isExpression = /[+\-*/()]/.test(amount);
  const labelInvalid = submitted && !label.trim();
  const amountInvalid = submitted && (amount.trim() === "" || value === null || value < 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!label.trim() || amount.trim() === "" || value === null || value < 0) {
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        label: label.trim(),
        amount: Math.round(value * 100) / 100,
        kind,
        certainty: "certain",
      });
      if (!initial) {
        setLabel("");
        setAmount("");
        setSubmitted(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="Bezeichnung, z. B. Geschenke"
          aria-label="Bezeichnung"
          aria-invalid={labelInvalid}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Input
          className="w-28 text-right tabular-nums"
          inputMode="text"
          placeholder="0,00"
          aria-label="Betrag"
          aria-invalid={amountInvalid}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      {isExpression ? (
        <div className="flex justify-end pr-1 text-xs text-muted-foreground">
          {value === null ? (
            <span className="text-destructive">Ungültiger Ausdruck</span>
          ) : (
            <span>
              ={" "}
              <span className="font-mono font-medium text-foreground">{formatAmount(value)}</span>
            </span>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<LiquidityKind>
          label="Art"
          value={kind}
          onChange={setKind}
          options={[
            { value: "expense", label: "Ausgabe" },
            { value: "income", label: "Einnahme" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1">
          {onCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Abbrechen
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
