import { Archive, Building2, Store } from "lucide-react";

import { cn } from "@/lib/utils";
import { logoBackgroundClass } from "@/lib/bank/zahlungspartner-logo";
import type { RecipientAccountLogo } from "@/hooks/use-recipient-account-logos";

type IconFrameProps = {
  src?: string;
  srcDark?: string;
  alt: string;
  className?: string;
  sizeClassName?: string;
  backgroundClassName?: string;
  imgNoPadding?: boolean;
  /** Extra padding around the image in pixels. Overrides the default p-1. */
  imgPadding?: number;
  kind?: "company" | "person";
  archived?: boolean;
};

function IconFrame({
  src,
  srcDark,
  alt,
  className,
  sizeClassName = "size-12",
  backgroundClassName = "bg-zinc-900",
  imgNoPadding = false,
  imgPadding,
  kind = "company",
  archived = false,
  CompanyFallback,
}: IconFrameProps & { CompanyFallback: typeof Store }) {
  const bare = backgroundClassName === "";
  const imgClassName = cn("h-full w-full object-contain", imgNoPadding ? "p-0" : "p-1");
  const imgStyle = imgPadding != null ? { padding: `${imgPadding}px` } : undefined;
  return (
    <div
      className={cn(
        "@container flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        !bare && "border",
        !bare && !src ? "!bg-muted/70" : null,
        backgroundClassName,
        sizeClassName,
        className,
      )}
    >
      {archived ? (
        <Archive className="size-[42cqw] text-amber-700 dark:text-amber-300" />
      ) : src && srcDark ? (
        <>
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={imgStyle}
            className={cn(imgClassName, "dark:hidden")}
          />
          <img
            src={srcDark}
            alt={alt}
            draggable={false}
            style={imgStyle}
            className={cn(imgClassName, "hidden dark:block")}
          />
        </>
      ) : src ? (
        <img src={src} alt={alt} draggable={false} style={imgStyle} className={imgClassName} />
      ) : kind === "person" ? (
        <span className="text-[25cqw] font-bold uppercase text-primary">
          {alt
            .split(" ")
            .filter(Boolean)
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      ) : (
        <CompanyFallback className="size-[33cqw] text-primary" />
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

export function RecipientLogo({
  logo,
  alt,
  sizeClassName = "size-9",
}: {
  logo?: RecipientAccountLogo;
  alt: string;
  sizeClassName?: string;
}) {
  return (
    <BrandIcon
      src={logo?.src}
      alt={alt}
      sizeClassName={sizeClassName}
      backgroundClassName={logoBackgroundClass(logo?.background)}
      kind={logo?.isCompany === false ? "person" : "company"}
      imgNoPadding={!logo?.padding}
    />
  );
}
