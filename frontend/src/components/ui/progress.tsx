import { motion } from "motion/react";

import { cn } from "@/lib/utils";

function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <motion.div
        className="h-full w-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}

export { Progress };
