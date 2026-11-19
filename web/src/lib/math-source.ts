const argumentCommands = new Set(["text", "mathrm", "mathbf", "mathit", "mathbb", "operatorname", "frac", "dfrac", "tfrac", "sqrt", "overline", "underline", "vec", "hat", "bar"]);
const symbols = new Set(["times", "div", "cdot", "pm", "mp", "le", "leq", "ge", "geq", "neq", "ne", "approx", "equiv", "in", "notin", "infty", "varnothing", "emptyset", "pi", "theta", "alpha", "beta", "gamma", "delta", "lambda", "mu", "sigma", "phi", "omega", "partial", "sum", "prod", "int", "lim", "sin", "cos", "tan", "log", "ln", "exp"]);

function groupEnd(value: string, from: number): number | undefined {
  const open = value[from], close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = from; i < value.length; i++) {
    if (value[i] === "\\") { i++; continue; }
    if (value[i] === open) depth++;
    if (value[i] === close && --depth === 0) return i + 1;
  }
}

function tokenEnd(value: string, from: number): number | undefined {
  const rest = value.slice(from);
  const command = /^\\([A-Za-z]+)/.exec(rest);
  if (command) {
    const name = command[1];
    if (!argumentCommands.has(name) && !symbols.has(name)) return;
    let end = from + command[0].length;
    if (argumentCommands.has(name)) {
      for (let count = 0; count < 3; count++) {
        const space = /^[ \t]*/.exec(value.slice(end))![0].length;
        const start = end + space;
        if (value[start] !== "{" && !(name === "sqrt" && value[start] === "[")) break;
        const next = groupEnd(value, start);
        if (next === undefined) return;
        end = next;
      }
      if (end === from + command[0].length) return;
    }
    return end;
  }
  if (value[from] === "{") return groupEnd(value, from);
  const number = /^[0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]+)?/.exec(rest);
  if (number) return from + number[0].length;
  if (/^[A-Za-z]$/u.test(value[from] ?? "") && !/[A-Za-z]/.test(value[from - 1] ?? "") && !/[A-Za-z]/.test(value[from + 1] ?? "")) return from + 1;
  if (/^[+−\-=×÷⋅^_<>≤≥≠±∞∅∈∩∪|(),./\[\]]$/u.test(value[from] ?? "")) return from + 1;
}

/** Add delimiters only to explicit TeX runs; never infer a fraction from ordinary a/b text. */
export function wrapBareMath(value: string): string {
  let out = "", position = 0;
  while (position < value.length) {
    let end = position, cursor = position, command = false;
    while (cursor < value.length) {
      const next = tokenEnd(value, cursor);
      if (next === undefined) break;
      command ||= value[cursor] === "\\";
      end = next;
      cursor = end + /^[ \t]*/.exec(value.slice(end))![0].length;
    }
    if (end > position) {
      const source = value.slice(position, end);
      out += command ? `\\(${source}\\)` : source;
      position = end;
    } else out += value[position++];
  }
  return out;
}
