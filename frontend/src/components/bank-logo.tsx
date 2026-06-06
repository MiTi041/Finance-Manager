import { Building2, Store } from "lucide-react";

import { cn } from "@/lib/utils";

type IconFrameProps = {
  src?: string;
  alt: string;
  className?: string;
  sizeClassName?: string;
  backgroundClassName?: string;
  imgNoPadding?: boolean;
  kind?: "company" | "person";
};

function IconFrame({
  src,
  alt,
  className,
  sizeClassName = "size-12",
  backgroundClassName = "bg-zinc-900",
  imgNoPadding = false,
  kind = "company",
  CompanyFallback,
}: IconFrameProps & { CompanyFallback: typeof Store }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        !src ? "!bg-muted/70" : null,
        backgroundClassName,
        sizeClassName,
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={cn(
            "h-full w-full object-contain",
            imgNoPadding ? "p-0" : "p-1",
          )}
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
