import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const colorStyles = {
  emerald: {
    on: "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15",
    pill: "bg-emerald-500 text-white",
  },
  amber: {
    on: "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15",
    pill: "bg-amber-500 text-white",
  },
} as const;

type ToggleRowProps = {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  color?: keyof typeof colorStyles;
  icon?: ReactNode;
  disabled?: boolean;
  stopPropagation?: boolean;
  size?: "md" | "sm";
  fullWidth?: boolean;
  pill?: string;
  className?: string;
};

export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  color = "emerald",
  icon,
  disabled,
  stopPropagation,
  size = "md",
  fullWidth = true,
  pill,
  className,
}: ToggleRowProps) {
  const styles = colorStyles[color];
  const padding = size === "sm" ? "px-3 py-2.5" : "px-4 py-3";
  const pillPadding = size === "sm" ? "px-2.5 py-0.5" : "px-3 py-1";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border text-left transition-colors disabled:opacity-50",
        fullWidth ? "w-full" : "w-fit",
        padding,
        checked ? styles.on : "border-muted bg-muted/70 hover:bg-muted/40",
        className,
      )}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        onCheckedChange(!checked);
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="shrink-0 text-muted-foreground">{icon}</span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full text-xs font-medium",
          pillPadding,
          checked ? styles.pill : "bg-muted text-muted-foreground",
        )}
      >
        {pill ?? (checked ? "Ja" : "Nein")}
      </span>
    </button>
  );
}