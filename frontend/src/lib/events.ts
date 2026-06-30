import { dispatchRefresh } from "@/lib/refresh-store";

export function emitReferenceChange() {
  try {
    dispatchRefresh();
  } catch {
    // ignore if running in non-browser environment
  }
}
