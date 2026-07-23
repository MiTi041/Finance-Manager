import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function HelpButton({ children, className }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex size-4 cursor-help items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground/80 select-none",
            className,
          )}
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] space-y-2 p-3 text-xs font-normal normal-case leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
