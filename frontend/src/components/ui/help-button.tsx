import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  label?: string;
};

export function HelpButton({ children, className, icon, label }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {label ? (
          <span
            className={cn(
              "inline-flex cursor-help items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground/80 select-none",
              className,
            )}
          >
            {icon}
            {label}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex size-4 cursor-help items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground/80 select-none",
              className,
            )}
          >
            ?
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] space-y-2 p-3 text-xs font-normal normal-case leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
