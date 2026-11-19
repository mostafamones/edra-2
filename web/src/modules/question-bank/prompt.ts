import { normalizeMathSource } from "@/lib/math";

function fingerprint(value: string): string {
  return value.normalize("NFKC")
    .replace(/\\(?:text|mathrm|mathbf)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\times\b/g, "×").replace(/\\[()[\]]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[\s\p{M}\p{P}{}]/gu, "");
}

/** Remove only an equivalent leading instruction, retaining the equation source verbatim. */
function withoutInstruction(value: string, instruction: string): string {
  const literal = instruction.trim();
  if (literal && value.startsWith(literal) && !/[\p{L}\p{N}]/u.test(value[literal.length] ?? "")) {
    return value.slice(literal.length).trimStart();
  }
  const colon = /[:：]/.exec(value);
  if (!colon || fingerprint(value.slice(0, colon.index + 1)) !== fingerprint(instruction)) return value;
  return value.slice(colon.index + 1).trimStart();
}

export function normalizePrompt(value: string, number?: string, sharedInstruction?: string): string {
  let instruction = sharedInstruction;
  let body = value.trim();
  if (!instruction) {
    const first = /^([^\n]*[:：])\s*\n/.exec(body);
    if (first && withoutInstruction(body.slice(first[0].length), first[1]) !== body.slice(first[0].length)) {
      instruction = first[1];
      body = body.slice(first[0].length);
    }
  }
  if (instruction) {
    let next = withoutInstruction(body, instruction);
    while (next !== body) { body = next; next = withoutInstruction(body, instruction); }
  }
  const label = /^(\\\(|\\\[)?\s*(?:\(([0-9٠-٩۰-۹]+)\)|([0-9٠-٩۰-۹]+)\))\s*/.exec(body);
  const digits = (text: string) => text.replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 0x6f0));
  if (label && number && digits(label[2] ?? label[3]) === digits(number.split(/[.٫]/).at(-1)!)) body = (label[1] ?? "") + body.slice(label[0].length);
  return normalizeMathSource(instruction ? `${instruction.trim()}\n${body}` : body);
}
