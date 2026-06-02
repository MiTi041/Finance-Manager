export type TimeSpan = { from: Date; until: Date };

export enum TimeRange {
  Last7Days = "last7days",
  Last30Days = "last30days",
  Last90Days = "last90days",
  ThisYear = "thisYear",
}

export function getTimeSpanForRange(
  range: TimeRange,
  now: Date = new Date(),
): TimeSpan {
  const dayMs = 24 * 60 * 60 * 1000;

  switch (range) {
    case TimeRange.Last7Days:
      return { from: new Date(now.getTime() - 7 * dayMs), until: now };
    case TimeRange.Last30Days:
      return { from: new Date(now.getTime() - 30 * dayMs), until: now };
    case TimeRange.Last90Days:
      return { from: new Date(now.getTime() - 90 * dayMs), until: now };
    case TimeRange.ThisYear:
      return { from: new Date(now.getFullYear(), 0, 1), until: now };
    default:
      return { from: new Date(now.getTime() - 30 * dayMs), until: now };
  }
}
