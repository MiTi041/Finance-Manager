export function evalArithmetic(input: string): number | null {
  const s = input.replace(/\s+/g, "").replace(/,/g, ".");
  if (!s) return null;
  let i = 0;

  const parseExpr = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;
    while (i < s.length && (s[i] === "+" || s[i] === "-")) {
      const op = s[i++];
      const rhs = parseTerm();
      if (rhs === null) return null;
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  };

  const parseTerm = (): number | null => {
    let value = parseFactor();
    if (value === null) return null;
    while (i < s.length && (s[i] === "*" || s[i] === "/")) {
      const op = s[i++];
      const rhs = parseFactor();
      if (rhs === null) return null;
      if (op === "/" && rhs === 0) return null;
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  };

  const parseFactor = (): number | null => {
    if (i >= s.length) return null;
    if (s[i] === "+") {
      i++;
      return parseFactor();
    }
    if (s[i] === "-") {
      i++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (s[i] === "(") {
      i++;
      const v = parseExpr();
      if (v === null || s[i] !== ")") return null;
      i++;
      return v;
    }
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (i === start) return null;
    const n = Number(s.slice(start, i));
    return Number.isFinite(n) ? n : null;
  };

  const result = parseExpr();
  if (result === null || i !== s.length || !Number.isFinite(result)) return null;
  return result;
}
