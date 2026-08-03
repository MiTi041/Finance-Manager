import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { formatAmount } from "@/lib/utils/format";

const parseEuros = (s: string): number | null => {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
};

const sanitizeEuros = (s: string): string => {
  const scrubbed = s.replace(/[^\d,.]/g, "");
  const sepIndex = scrubbed.search(/[,.]/);
  if (sepIndex === -1) return scrubbed;
  const intPart = scrubbed.slice(0, sepIndex);
  const decPart = scrubbed.slice(sepIndex + 1).replace(/[,.]/g, "").slice(0, 2);
  return `${intPart},${decPart}`;
};

export function PayoutSlider({
  value,
  max,
  anchorValue,
  hideAnchor,
  variant = "default",
  bigValue = false,
  onChange,
}: {
  value: number;
  max: number;
  anchorValue?: number;
  hideAnchor?: boolean;
  variant?: "default" | "destructive";
  bigValue?: boolean;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [bigCents, setBigCents] = useState<number | null>(null);
  const [outOfRange, setOutOfRange] = useState(false);
  const active = dragging || focused;

  const handleInputChange = (raw: string) => {
    const sanitized = sanitizeEuros(raw);
    setEditing(sanitized);
    const parsed = parseEuros(sanitized);
    const valid = parsed != null && parsed >= 0 && parsed <= max;
    setOutOfRange(sanitized.length > 0 && !valid);
    if (valid && parsed != null) onChange(parsed);
  };
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const anchorPct =
    anchorValue != null && max > 0 ? Math.min(100, Math.max(0, (anchorValue / max) * 100)) : null;
  const atAnchor = anchorValue != null && Math.abs(value - anchorValue) < 0.5;

  const fillClass = variant === "destructive" ? "bg-destructive" : "bg-primary";
  const activePresetClass = variant === "destructive"
    ? "bg-destructive/10 text-destructive"
    : "bg-primary/10 text-primary";
  const focusRingClass = variant === "destructive"
    ? "focus-visible:ring-destructive/40"
    : "focus-visible:ring-primary/40";
  const anchorLineClass = atAnchor
    ? variant === "destructive" ? "bg-destructive" : "bg-primary"
    : "bg-foreground/25";

  const resolveValue = (raw: number) => {
    if (anchorValue != null && max > 0) {
      const snapThreshold = Math.max(1, max * 0.015);
      if (Math.abs(raw - anchorValue) <= snapThreshold) return anchorValue;
    }
    return raw;
  };

  const updateFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || max <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(resolveValue(Math.min(max, Math.round(ratio * max))));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (max <= 0) return;
    const step = e.shiftKey ? Math.max(1, Math.round(max / 20)) : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(0, value - step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  };

  const presets = [0.25, 0.5, 0.75, 1];
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5);

  return (
    <div className="space-y-2.5">
      {bigValue ? (
        <div className="flex items-center justify-center gap-1">
          {bigCents != null ? (
            <input
              type="text"
              inputMode="decimal"
              aria-label="Betrag"
              aria-invalid={outOfRange}
              value={new Intl.NumberFormat("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(bigCents / 100)}
              style={{ width: `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bigCents / 100).length}ch` }}
              onKeyDown={(e) => {
                if (/^[0-9]$/.test(e.key)) {
                  e.preventDefault();
                  const next = bigCents * 10 + Number(e.key);
                  if (next / 100 <= max) {
                    setBigCents(next);
                    onChange(next / 100);
                  }
                } else if (e.key === "Backspace") {
                  e.preventDefault();
                  const next = Math.floor(bigCents / 10);
                  setBigCents(next);
                  onChange(next / 100);
                }
              }}
              onBlur={() => {
                setBigCents(null);
                setOutOfRange(false);
              }}
              autoFocus
              className={`h-12 bg-transparent px-0 text-center text-5xl font-bold leading-none text-foreground outline-none ${outOfRange ? "text-orange-500" : ""}`}
            />
          ) : (
            <button
              type="button"
              aria-label="Betrag bearbeiten"
              onClick={() => {
                setBigCents(Math.round(value * 100));
                setOutOfRange(false);
              }}
              className="inline-flex h-12 cursor-pointer items-center justify-center leading-none"
            >
              <NumberFlow
                value={value}
                format={{ style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                locales="de-DE"
                className="text-5xl font-bold leading-none text-foreground"
              />
            </button>
          )}
          <span className="text-4xl font-bold text-foreground">€</span>
        </div>
      ) : (
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Betrag anpassen</span>
          <span className="relative">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Betrag"
              aria-invalid={outOfRange}
              value={editing ?? formatAmount(value).replace(/\s*€.*$/, "")}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={(e) => {
                setEditing(value.toFixed(2).replace(".", ","));
                setOutOfRange(false);
                e.target.select();
              }}
              onBlur={() => {
                setEditing(null);
                setOutOfRange(false);
              }}
              className={`w-28 pr-6 text-right text-sm font-semibold tabular-nums rounded-md border px-1.5 py-0.5 outline-none transition-colors ${
                outOfRange
                  ? "border-orange-500 bg-orange-500/5 text-orange-600 focus:ring-2 focus:ring-orange-500/40"
                  : "border-input bg-muted/40 text-foreground hover:bg-muted/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/40"
              }`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </span>
        </div>
      )}
      {outOfRange && (
        <p className="text-right text-[11px] font-medium text-orange-500">
          Betrag muss zwischen 0 und {formatAmount(max)} liegen
        </p>
      )}

      <div className="space-y-1">
        <div
          ref={trackRef}
          className="relative flex h-5 items-center cursor-pointer touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted" />
          <div
            className={`absolute h-1.5 rounded-full ${fillClass} ${
              dragging ? "" : "transition-[width] duration-300 ease-out"
            }`}
            style={{ width: `${pct}%`, minWidth: pct > 0 ? "8px" : undefined } as React.CSSProperties}
          />

          {anchorPct != null && (
            <div
              className={`pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200 ${anchorLineClass}`}
              style={{ left: `${anchorPct}%` }}
            />
          )}

          <div
            role="slider"
            tabIndex={0}
            aria-label="Betrag"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`absolute -translate-x-1/2 size-4 rounded-full bg-background ring-1 ring-border shadow-md outline-none focus-visible:ring-2 ${focusRingClass}
              ${
                dragging
                  ? "cursor-grabbing scale-110 shadow-lg"
                  : "cursor-grab transition-[left,transform,box-shadow] duration-300 ease-out hover:scale-105"
              }`}
            style={{ left: `${pct}%` }}
          >
            <div
              className={`pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-md transition-all duration-150 ease-out ${
                active ? "opacity-100 scale-100" : "opacity-0 scale-90"
              }`}
            >
              {formatAmount(value)}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-foreground" />
            </div>
          </div>
        </div>

        <div className="flex justify-between px-0.5">
          {ticks.map((t) => (
            <div
              key={t}
              className={`w-px rounded-full ${
                t % 25 === 0 ? "h-2 bg-muted-foreground/50" : "h-1 bg-muted-foreground/25"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {presets.map((p) => {
          const presetValue = Math.min(max, Math.round(max * p));
          const isActive = !atAnchor && Math.abs(value - presetValue) < 1;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(presetValue)}
              className={`flex-1 cursor-pointer rounded-md py-1 text-[11px] font-medium transition-colors duration-150 ${
                isActive
                  ? activePresetClass
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {p === 1 ? "Alles" : `${Math.round(p * 100)}%`}
            </button>
          );
        })}
        {anchorValue != null && !hideAnchor && (
          <button
            type="button"
            onClick={() => onChange(anchorValue)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition-colors duration-150 ${
              atAnchor
                ? activePresetClass
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <RotateCcw className="size-3" />
            Rate
          </button>
        )}
      </div>
    </div>
  );
}
