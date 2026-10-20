import { z } from "zod";
import type { DepartureContext } from "./state";
const prefix = "edra:exam-departure:";
const schema = z.object({ accountId: z.uuid(), attemptId: z.uuid(), examId: z.uuid(),
  eventId: z.uuid(), questionId: z.uuid().nullable(), generation: z.number().int().positive() }).strict();
export type Breadcrumb = z.infer<typeof schema>;
const key = (account: string, attempt: string) => `${prefix}${account}:${attempt}`;
export function writeBreadcrumb(accountId: string, attemptId: string, examId: string, event: DepartureContext) {
  try { localStorage.setItem(key(accountId, attemptId), JSON.stringify({ accountId, attemptId, examId, ...event })); } catch { /* Best effort. */ }
}
export function clearBreadcrumb(accountId: string, attemptId: string, eventId?: string) {
  try {
    const storageKey = key(accountId, attemptId);
    const raw = localStorage.getItem(storageKey);
    if (!eventId || (raw && JSON.parse(raw).eventId === eventId)) localStorage.removeItem(storageKey);
  } catch { /* Storage unavailable. */ }
}
export function readBreadcrumbs(accountId: string, examId: string): Breadcrumb[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(`${prefix}${accountId}:`)).flatMap((k) => {
      try {
        const parsed = schema.safeParse(JSON.parse(localStorage.getItem(k) ?? "null"));
        return parsed.success && parsed.data.accountId === accountId && parsed.data.examId === examId ? [parsed.data] : [];
      } catch { return []; }
    });
  } catch { return []; }
}
export function purgeBreadcrumbs(accountId: string | null) {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(prefix) && (!accountId || !k.startsWith(`${prefix}${accountId}:`))) localStorage.removeItem(k); } catch { /* Best effort. */ }
}
