import { RangeOption } from "@/types/range";

/**
 * Wandelt ein deutsches Datumsformat (z. B. "31.07.2025") in ein Date-Objekt um.
 * Gibt `null` zurück, wenn ungültig.
 */
export function parseGermanDate(str: string): Date | null {
  const [day, month, year] = str.split(".").map((part) => parseInt(part, 10));
  if (!day || !month || !year || day > 31 || month > 12 || year < 1000) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  return isNaN(date.getTime()) ? null : date;
}

export function formatDateToGerman(date: Date | null): string | null {
  if (!date) return null;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Gibt die Start- und Vorperiode-Zeitpunkte für einen gegebenen Zeitraum zurück.
 * Beispiel: '7days' → Zeitraum von vor 6 Tagen bis heute inkl. sowie Vorperiode vor diesem Zeitraum.
 */
export function getFromDate(range: RangeOption): {
  fromDate: Date;
  prevFromDate: Date;
  prevToDate: Date;
} {
  if (range === "all") {
    return {
      fromDate: new Date(0),
      prevFromDate: new Date(0),
      prevToDate: new Date(0),
    };
  }

  const now = new Date();
  const endOfTodayUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  let fromDateUtc: Date;

  switch (range) {
    case "7days":
      fromDateUtc = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 6, // inkl. heute → 7 Tage
          0,
          0,
          0,
          0,
        ),
      );
      break;

    case "30days":
      fromDateUtc = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 29,
          0,
          0,
          0,
          0,
        ),
      );
      break;

    case "90days":
      fromDateUtc = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 89,
          0,
          0,
          0,
          0,
        ),
      );
      break;

    case "thisYear":
      fromDateUtc = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
      break;

    default:
      throw new Error(`Unknown range: ${range}`);
  }

  const diffMs = endOfTodayUtc.getTime() - fromDateUtc.getTime();

  const prevFromDate = new Date(fromDateUtc.getTime() - diffMs);
  const prevToDate = new Date(fromDateUtc.getTime());

  return {
    fromDate: fromDateUtc,
    prevFromDate,
    prevToDate,
  };
}

export function getRangeToString(range: RangeOption): string {
  switch (range) {
    case "7days":
      return "Last 7 days";
    case "30days":
      return "Last 30 days";
    case "90days":
      return "Last 90 days";
    case "thisYear":
      return "This year";
    case "all":
      return "Alltime";
    default:
      return "Alltime";
  }
}
