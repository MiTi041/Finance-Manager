export function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parts = value.split("T")[0].split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(d.getTime()) ? undefined : d;
}

export function formatDateDisplay(date: Date | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("de-DE");
}

export function formatDateInputValue(date: Date | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastWorkingDay(year: number, month: number, holidays: Set<string>): Date {
  const pd = new Date(year, month + 1, 0);
  while (pd.getDay() === 0 || pd.getDay() === 6 || holidays.has(isoDate(pd))) {
    pd.setDate(pd.getDate() - 1);
  }
  return pd;
}

// Mirror of backend db.savings.count_income_events_until
export function countIncomeEventsUntil(
  targetDate: Date,
  payoutDays: number[],
  fromDate: Date,
  minResult = 1,
  holidays: Set<string> = new Set(),
): number {
  if (targetDate <= fromDate) return minResult;
  const days = payoutDays.length > 0 ? payoutDays : [1];
  let result = 0;
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  while (cursor <= end) {
    const candidates = days.map((day) => {
      if (day < 0) {
        return lastWorkingDay(cursor.getFullYear(), cursor.getMonth(), holidays);
      }
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      return new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, last));
    });
    const pd = new Date(Math.max(...candidates.map((d) => d.getTime())));
    if (fromDate <= pd && pd <= targetDate) result += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return Math.max(minResult, result);
}

// Only the latest payout date per month matters (e.g. [15, -1] → last working day)
export function effectivePayoutDays(payoutDays: number[]): number[] {
  if (payoutDays.length === 0) return [];
  if (payoutDays.some((d) => d < 0)) return [-1];
  return [Math.max(...payoutDays)];
}
