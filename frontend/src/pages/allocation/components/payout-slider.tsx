import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatAmount } from "@/lib/utils/format";

export function PayoutSlider({
  value,
  max,
  anchorValue,
  hideAnchor,
  variant = "default",
  onChange,
}: {
  value: number;
  max: number;
  anchorValue?: number;
  hideAnchor?: boolean;
  variant?: "default" | "destructive";
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = dragging || focused;
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
    onChange(resolveValue(Math.round(ratio * max)));
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
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Betrag anpassen</span>
        <span className="text-sm font-semibold tabular-nums">{formatAmount(value)}</span>
      </div>

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
          const presetValue = Math.round(max * p);
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
