export async function emitReferenceChange() {
  try {
    window.dispatchEvent(new CustomEvent("finance-reference-data-changed"));
  } catch {
    // ignore if running in non-browser environment
  }
}
