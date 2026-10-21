// Helpers for authoring the question bank: code blocks keep their backslashes and lose the source indentation.

/** Tagged template: raw text (so '\n' stays two characters), common indentation and outer blank lines removed. */
export function code(strings, ...values) {
  const lines = String.raw(strings, ...values).replace(/^\n/, "").replace(/\n\s*$/, "").split("\n");
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return lines.map((line) => line.slice(indent)).join("\n");
}

/** A complete C++17 program: `before` holds functions declared ahead of main, `body` the statements of main. */
export function cpp(body, { before = "", includes = ["iostream"] } = {}) {
  const head = includes.map((name) => `#include <${name}>`).join("\n");
  const main = body.split("\n").map((line) => (line ? `  ${line}` : line)).join("\n");
  return [head, before, `int main() {\n${main}\n  return 0;\n}`].filter(Boolean).join("\n\n");
}
