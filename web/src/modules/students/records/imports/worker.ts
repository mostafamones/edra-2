/// <reference lib="webworker" />
import { parseSource } from "./parsers";
import type { ImportFormat, ParseResult } from "./types";

export type ParseRequest = { file: File; format: ImportFormat; sheet: string | null };

/** Parses one file off the main thread and posts back a ParseResult. */
self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { file, format, sheet } = event.data;
  let result: ParseResult;
  try {
    result = await parseSource(new Uint8Array(await file.arrayBuffer()), format, sheet);
  } catch {
    result = { ok: false, error: { code: "unavailable", message: "The file couldn’t be read. Check it and try again." } };
  }
  self.postMessage(result);
};
