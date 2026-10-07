import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  LiquidityCertainty,
  LiquidityEntryInput,
  LiquidityKind,
} from "@/lib/liquidity";

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
  const [certainty, setCertainty] = useState<LiquidityCertainty>(
    initial?.certainty ?? "certain",
  );
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!label.trim() || !Number.isFinite(value) || value < 0) return;
    setBusy(true);
    try {
      await onSubmit({ label: label.trim(), amount: value, kind, certainty });
      if (!initial) {
        setLabel("");
        setAmount("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        className="min-w-40 flex-1"
        placeholder="Bezeichnung (z. B. Geschenke)"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <Input
        className="w-28"
        inputMode="decimal"
        placeholder="Betrag"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant={kind === "expense" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setKind("expense")}
      >
        Ausgabe
      </Button>
      <Button
        type="button"
        size="sm"
        variant={kind === "income" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setKind("income")}
      >
        Einnahme
      </Button>
      <Button
        type="button"
        size="sm"
        variant={certainty === "certain" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setCertainty("certain")}
      >
        sicher
      </Button>
      <Button
        type="button"
        size="sm"
        variant={certainty === "expected" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setCertainty("expected")}
      >
        erwartet
      </Button>
      <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy}>
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={onCancel}
        >
          Abbrechen
        </Button>
      ) : null}
    </form>
  );
}
