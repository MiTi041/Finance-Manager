import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/ui/help-button";
import { PayoutSlider } from "../payout-slider";
import { formatAmount } from "@/lib/utils/format";

type Props = {
  bucketType: string;
  isInfoOnly: boolean;
  hasRecipient: boolean;
  accent: { icon: string; bar: string; badge: string; barMuted: string };
  transferring: boolean;
  bucketRunId: number;
  // Non-bafoeg
  isPaid: boolean;
  topUp: number;
  // Bafoeg
  bafoegFullyPaid: boolean;
  bafoegTopUp: number;
  bafoegPaid: boolean;
  bafoegOutstanding: number;
  onTransfer: (runBucketId: number, amount?: number) => void;
};

export function BucketFooter(props: Props) {
  const {
    bucketType, isInfoOnly, hasRecipient, accent, transferring, bucketRunId,
    isPaid, topUp,
    bafoegFullyPaid, bafoegTopUp, bafoegPaid, bafoegOutstanding, onTransfer,
  } = props;
  const [sliderValues, setSliderValues] = useState<Record<number, number>>({});

  if (isInfoOnly) return null;

  if (bucketType === "bafoeg") {
    if (bafoegFullyPaid) {
      return (
        <div className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${accent.badge}`}>
          <CheckCircle2 className="size-4" />
          Schulden beglichen
        </div>
      );
    }

    if (!hasRecipient) {
      return (
        <div className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground break-words">
          Kein Empfängerkonto ausgewählt. Bitte in den Einstellungen hinzufügen
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {bafoegTopUp > 0 ? (
          <Button size="sm" className="w-full" disabled={transferring} onClick={() => onTransfer(bucketRunId)}>
            {transferring ? "Wird gesendet…" : `${formatAmount(bafoegTopUp)} jetzt überweisen`}
          </Button>
        ) : bafoegPaid && !bafoegFullyPaid ? (
          <div className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${accent.badge}`}>
            <CheckCircle2 className="size-4" />
            Monatsziel erreicht
          </div>
        ) : null}
        {bafoegOutstanding > bafoegTopUp && (
          <div className="mt-2 flex flex-col gap-3 border-t border-destructive/20 pt-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-destructive">Schulden tilgen</span>
              <HelpButton>
                Hier kannst du einen zusätzlichen Betrag zur Tilgung deiner ausstehenden BAföG-Schulden überweisen. Der Betrag wird zusätzlich zur monatlichen Rate gezahlt.
              </HelpButton>
            </div>
            <PayoutSlider
              value={sliderValues[bucketRunId] ?? bafoegOutstanding}
              max={bafoegOutstanding}
              hideAnchor
              variant="destructive"
              onChange={(v) => setSliderValues((prev) => ({ ...prev, [bucketRunId]: v }))}
            />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="w-full"
              disabled={transferring}
              onClick={() => onTransfer(bucketRunId, sliderValues[bucketRunId] ?? bafoegOutstanding)}
            >
              {transferring
                ? "Wird gesendet…"
                : `${formatAmount(sliderValues[bucketRunId] ?? bafoegOutstanding)} jetzt überweisen`}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (isPaid) {
    return (
      <div className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${accent.badge}`}>
        <CheckCircle2 className="size-4" />
        Monatsziel erreicht
      </div>
    );
  }

  if (!hasRecipient) {
    return (
      <div className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground break-words">
        Kein Empfängerkonto ausgewählt. Bitte in den Einstellungen hinzufügen
      </div>
    );
  }

  return (
    <Button size="sm" disabled={transferring} onClick={() => onTransfer(bucketRunId)} className="w-full">
      {transferring ? "Wird gesendet…" : `${formatAmount(topUp)} jetzt überweisen`}
    </Button>
  );
}
