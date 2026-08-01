import { formatDate } from "@/lib/utils/format";
import { type Transaction } from "@/types/transaction";

export function PurposeSection({ transaction }: { transaction: Transaction }) {
  const purpose = transaction.texte.verwendungszweck || "";
  const additionalPurpose = transaction.texte.zusatzVerwendungszweck || "";

  return (
    <div className="space-y-2 px-5 py-4">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Verwendungszweck
      </p>

      {purpose ? (
        <p className="whitespace-normal leading-relaxed text-foreground">{purpose}</p>
      ) : null}

      {additionalPurpose && additionalPurpose !== purpose ? (
        <div
          className={
            purpose ? "flex flex-col gap-0.5 border-t border-border/50 pt-2" : ""
          }
        >
          {purpose ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
              Zusatz
            </span>
          ) : null}
          <p className="whitespace-normal leading-relaxed text-foreground">
            {additionalPurpose}
          </p>
        </div>
      ) : null}

      {!purpose && !additionalPurpose ? <p className="text-muted-foreground">–</p> : null}

      {transaction.texte.buchungstext ? (
        <p className="pt-1 font-mono text-xs text-muted-foreground">
          {transaction.texte.buchungstext}
        </p>
      ) : null}
      {transaction.daten.wertstellungsdatum &&
      transaction.daten.wertstellungsdatum !== transaction.daten.buchungsdatum ? (
        <p className="pt-1 text-xs text-muted-foreground">
          Wertstellung: {formatDate(transaction.daten.wertstellungsdatum)}
        </p>
      ) : null}
    </div>
  );
}
