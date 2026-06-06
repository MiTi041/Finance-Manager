import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-3.5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="flex gap-3.5">
        <Skeleton className="h-64 flex-1 rounded-2xl" />
        <Skeleton className="h-64 w-[320px] rounded-2xl" />
      </div>
    </div>
  );
}
