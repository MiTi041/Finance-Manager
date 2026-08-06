import { dispatchRefresh } from "@/lib/refresh-store";

export function emitReferenceChange(sourceId?: string) {
  try {
    dispatchRefresh(sourceId);
  } catch {
    // ignore if running in non-browser environment
  }
}
