import type { ReactNode } from "react";

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-4 text-xs font-medium tracking-[0.06em] uppercase text-muted-foreground">
      {children}
    </h3>
  );
}
