import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-normal !transition-[background-color,background-image,box-shadow,border-color,color,opacity] !duration-100 !ease-in-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "relative text-white border border-[#1d5fd1] " +
          "bg-gradient-to-b from-[#3b82f6] to-[#2563eb] " +
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.05)] " +
          "hover:from-[#4c8bfa] hover:to-[#3170f0] " +
          "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_4px_rgba(0,0,0,0.25)] " +
          "active:from-[#2563eb] active:to-[#1d4ed8] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]",

        destructive:
          "relative text-white border border-[#b91c1c] " +
          "bg-gradient-to-b from-[#ef4444] to-[#dc2626] " +
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.05)] " +
          "hover:from-[#f26363] hover:to-[#e13d3d] " +
          "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_4px_rgba(0,0,0,0.25)] " +
          "active:from-[#dc2626] active:to-[#b91c1c] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] " +
          "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",

        outline:
          "relative text-foreground border border-input " +
          "bg-gradient-to-b from-white to-[#f4f4f5] dark:from-[#2a2a2e] dark:to-[#1f1f22] " +
          "shadow-[inset_0_0.5px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.06)] " +
          "dark:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.3)] " +
          "hover:from-[#fafafa] hover:to-[#ececee] dark:hover:from-[#333338] dark:hover:to-[#26262a] " +
          "hover:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.08)] " +
          "dark:hover:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.12),0_2px_4px_rgba(0,0,0,0.35)] " +
          "active:from-[#f0f0f1] active:to-[#e4e4e7] dark:active:from-[#222225] dark:active:to-[#1a1a1c]",

        secondary:
          "relative text-secondary-foreground border border-[#d4d4d8] dark:border-[#3f3f46] " +
          "bg-gradient-to-b from-[#f4f4f5] to-[#e4e4e7] dark:from-[#3a3a3e] dark:to-[#2c2c30] " +
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_2px_rgba(0,0,0,0.08)] " +
          "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.3)] " +
          "hover:from-[#fafafa] hover:to-[#ececee] dark:hover:from-[#454549] dark:hover:to-[#333336] " +
          "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_4px_rgba(0,0,0,0.1)] " +
          "dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_4px_rgba(0,0,0,0.35)] " +
          "active:from-[#e4e4e7] active:to-[#d4d4d8] dark:active:from-[#2c2c30] dark:active:to-[#222225]",

        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-control gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-control px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Klassen, die die from-/to-/border-Werte des default-Variants via CSS-Variablen ersetzen.
// Werden nur zusätzlich angehängt, wenn eine accentColor übergeben wird.
const accentOverrideClasses =
  "from-[var(--accent-from)] to-[var(--accent-to)] border-[var(--accent-border)] " +
  "hover:from-[var(--accent-hover-from)] hover:to-[var(--accent-hover-to)] " +
  "active:from-[var(--accent-active-from)] active:to-[var(--accent-active-to)]";

function getAccentStyle(accentColor: string): React.CSSProperties {
  return {
    "--accent-from": `color-mix(in srgb, ${accentColor} 80%, white)`,
    "--accent-to": accentColor,
    "--accent-border": `color-mix(in srgb, ${accentColor} 75%, black)`,
    "--accent-hover-from": `color-mix(in srgb, ${accentColor} 65%, white)`,
    "--accent-hover-to": `color-mix(in srgb, ${accentColor} 88%, white)`,
    "--accent-active-from": accentColor,
    "--accent-active-to": `color-mix(in srgb, ${accentColor} 85%, black)`,
  } as React.CSSProperties;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  height = 10,
  accentColor,
  style,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    height?: number;
    /**
     * Nur bei variant="default" (bzw. keiner Angabe) wirksam.
     * Beliebiger CSS-Farbwert, z.B. "#8b5cf6", "violet", "oklch(0.6 0.2 300)".
     */
    accentColor?: string;
  }) {
  const Comp = asChild ? Slot : "button";
  const isDefaultVariant = !variant || variant === "default";
  const useAccent = isDefaultVariant && !!accentColor;

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        useAccent && accentOverrideClasses,
        "hover:cursor-pointer",
      )}
      style={{
        height: `${height * 4}px`,
        ...(useAccent ? getAccentStyle(accentColor!) : null),
        ...style,
      }}
      {...props}
    />
  );
}

export { Button, buttonVariants };
