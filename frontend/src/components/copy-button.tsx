import { type MouseEvent, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
};

/** Always-visible copy icon; turns into a green check for a moment after copying. */
export function CopyButton({ value, label = "Kopieren", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — silently ignore
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center text-muted-foreground/60 transition-colors hover:text-foreground",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}
