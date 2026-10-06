import { z } from "zod";

/**
 * Keyset cursor for live-session pages: the last row's start time and id, ordered newest first.
 * Opaque to clients; encoded as base64url JSON.
 */
export type SessionCursor = { startedAt: string; id: string };

const cursorSchema = z.object({ startedAt: z.iso.datetime({ offset: true }), id: z.uuid() });

export function encodeCursor(cursor: SessionCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** The decoded cursor, or null when the value is malformed. */
export function decodeCursor(value: string): SessionCursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
