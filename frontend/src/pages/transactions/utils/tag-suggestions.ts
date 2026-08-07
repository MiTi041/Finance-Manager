import { fetchSavingsPlans } from "@/lib/allocation";

const STANDARD_BUCKET_TAGS = ["bafoegschulden", "notfallfonds", "investieren", "spenden"];

let cache: string[] | null = null;
let inFlight: Promise<string[]> | null = null;

export function loadTagSuggestions(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const names = new Set<string>();
    for (const tag of STANDARD_BUCKET_TAGS) {
      names.add(tag);
      names.add(`${tag}.entnahme`);
    }
    try {
      const plans = await fetchSavingsPlans();
      for (const plan of plans) {
        if (!plan.tag) continue;
        const name = plan.tag.replace(/^tag\./, "");
        names.add(name);
        names.add(`${name}.entnahme`);
      }
    } catch {
      // Suggestions are optional; fall back to the standard set.
    }
    cache = Array.from(names).sort();
    return cache;
  })();

  inFlight.finally(() => {
    inFlight = null;
  });
  return inFlight;
}