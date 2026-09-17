import { Archive, Building2, Store } from "lucide-react";

import { cn } from "@/lib/utils";

type IconFrameProps = {
  src?: string;
  alt: string;
  className?: string;
  sizeClassName?: string;
  backgroundClassName?: string;
  imgNoPadding?: boolean;
  kind?: "company" | "person";
  archived?: boolean;
};

function IconFrame({
  src,
  alt,
  className,
  sizeClassName = "size-12",
  backgroundClassName = "bg-zinc-900",
  imgNoPadding = false,
  kind = "company",
  archived = false,
  CompanyFallback,
}: IconFrameProps & { CompanyFallback: typeof Store }) {
  const bare = backgroundClassName === "";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        !bare && "border",
        !bare && !src ? "!bg-muted/70" : null,
        backgroundClassName,
        sizeClassName,
        className,
      )}
    >
      {archived ? (
        <Archive className="size-5 text-amber-700 dark:text-amber-300" />
      ) : src ? (
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full object-contain", imgNoPadding ? "p-0" : "p-1")}
        />
      ) : kind === "person" ? (
        <span className="text-[12px] font-bold uppercase text-primary">
          {alt
            .split(" ")
            .filter(Boolean)
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      ) : (
        <CompanyFallback className="size-4 text-primary" />
      )}
    </div>
  );
}

export function BankLogo(props: IconFrameProps) {
  return <IconFrame {...props} CompanyFallback={Store} />;
}

export function BrandIcon(props: IconFrameProps) {
  return <IconFrame {...props} CompanyFallback={Building2} />;
}
