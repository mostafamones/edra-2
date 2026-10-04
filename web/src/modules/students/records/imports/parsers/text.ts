import type { ParseError } from "../types";

const ENCODING_ERROR: ParseError = {
  code: "encoding",
  message: "The file’s text encoding isn’t supported. Save it as UTF-8 (in Excel: “CSV UTF-8”) and try again.",
};

/**
 * Decodes UTF-8 (with or without a byte order mark) or BOM-marked UTF-16. Anything that is not
 * valid in the detected encoding is rejected rather than guessed.
 */
export function decodeText(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: ParseError } {
  let encoding = "utf-8";
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = "utf-16le"; start = 2; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = "utf-16be"; start = 2; }
  try {
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start));
    return { ok: true, text };
  } catch {
    return { ok: false, error: ENCODING_ERROR };
  }
}
