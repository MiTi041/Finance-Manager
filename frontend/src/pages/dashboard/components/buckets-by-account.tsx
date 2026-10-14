import { formatIban } from "@/lib/iban";
import { formatAmount } from "@/lib/utils/format";
import type { AccountBuckets } from "@/lib/buckets-by-account";
import { SectionHeading } from "./section-heading";

export function BucketsByAccount({ groups }: { groups: AccountBuckets[] }) {
  if (groups.length === 0) return null;

  return (
    <section>
      <SectionHeading>Töpfe nach Konto</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {groups.map((group) => (
          <article
            key={group.iban}
            className="flex flex-col gap-3 rounded-panel border border-border bg-card p-4"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                {formatIban(group.iban)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {group.buckets.map((bucket) => (
                <div key={bucket.bucketType} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{bucket.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-foreground">
                    {formatAmount(bucket.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">Summe</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {formatAmount(group.total)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
