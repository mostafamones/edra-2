import { recordStudentExamDeparture } from "../actions";
import { studentFailure } from "../errors";
import { clearBreadcrumb, readBreadcrumbs } from "../departures/breadcrumb";
import type { DepartureContext } from "../departures/state";
import { indexedDbJournal, readJournal, type JournalEntry, type JournalStore } from "./journal";

/** Exact replay precedes replacement claims; answers and submission intents survive metadata updates. */
export async function recoverDeparture(
  accountId: string, academyId: string, examId: string, token: string | null, store: JournalStore = indexedDbJournal,
) {
  const pending = new Map<string, { attemptId: string; event: DepartureContext; entry?: JournalEntry; key?: string }>();
  for (const crumb of readBreadcrumbs(accountId, examId)) pending.set(crumb.eventId, { attemptId: crumb.attemptId,
    event: { eventId: crumb.eventId, questionId: crumb.questionId, generation: crumb.generation } });
  try {
    for (const key of await store.keys()) {
      if (!key.startsWith(`${accountId}:`)) continue;
      const { entry } = await readJournal(store, accountId, key.slice(accountId.length + 1));
      if (entry?.examId === examId && entry.departure) pending.set(entry.departure.eventId, { attemptId: entry.attemptId, event: entry.departure, entry, key });
    }
  } catch { /* Synchronous breadcrumbs remain usable when IndexedDB is unavailable. */ }
  let warning: { event: DepartureContext; count: number } | undefined;
  let warningOrdinal = 0;
  try {
    for (const { attemptId, event, entry, key } of pending.values()) {
      const result = token ? await recordStudentExamDeparture({ academyId, examId, token, ...event }) : null;
      if (result && !result.ok) return result;
      if (result && (result.kind === "warned" || result.kind === "duplicate") && result.state) {
        const ordinal = result.departure?.ordinal ?? result.state.attempt.departureCount;
        if (ordinal >= warningOrdinal) {
          warningOrdinal = ordinal;
          warning = { event, count: result.state.attempt.departureCount };
        }
      }
      const undeliverable = !result || result.kind === "editor_lost";
      if (entry && key) {
        if (result?.kind === "kicked" || result?.kind === "finalized") await store.delete(key);
        else {
          const next = { ...entry, departure: null };
          if (!Object.keys(next.drafts).length && !next.inflight && !next.submission) await store.delete(key);
          else await store.put(key, next);
        }
      }
      clearBreadcrumb(accountId, attemptId, event.eventId);
      if (undeliverable) return { ok: false as const, code: "unavailable" as const,
        message: "A previous editor’s pending departure could not be authorized. Try again to resume the exam." };
    }
    return warning ? { ok: true as const, warning } : { ok: true as const };
  } catch { return studentFailure("unavailable"); }
}
