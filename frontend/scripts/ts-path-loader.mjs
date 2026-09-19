import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveAlias(specifier) {
  const relative = specifier.slice(2);
  for (const extension of extensions) {
    const candidate = resolve(srcDir, relative + extension);
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveAlias(specifier);
      if (resolved) return nextResolve(resolved, context);
    }
    return nextResolve(specifier, context);
  },
});
