import { recordStudentExamDeparture } from "../actions";
import { studentFailure } from "../errors";
import { indexedDbJournal, readJournal, type JournalStore } from "./journal";

/** Deliver a recorded event before entry can replace its expired generation. This never claims an editor. */
export async function recoverDeparture(
  accountId: string, academyId: string, examId: string, token: string | null, store: JournalStore = indexedDbJournal,
) {
  let keys: string[];
  try { keys = await store.keys(); } catch { return { ok: true as const }; }
  try {
    for (const key of keys) {
      if (!key.startsWith(`${accountId}:`)) continue;
      const { entry } = await readJournal(store, accountId, key.slice(accountId.length + 1));
      if (!entry || entry.examId !== examId || !entry.departure) continue;
      if (!token) return studentFailure("unavailable");
      const pending = entry.departure;
      const result = await recordStudentExamDeparture({ academyId, examId, token, ...pending });
      if (!result.ok) return result;
      if (result.kind === "editor_lost") {
        // This generation was definitively refused. Preserve its answers and report the event loss
        // once; a second entry may recover normally without retrying a permanently fenced event.
        await store.put(key, { ...entry, departure: null });
        return { ok: false as const, code: "unavailable" as const,
          message: "A previous editor’s pending departure was refused. Try again to resume the exam." };
      }
      if (result.kind === "kicked" || result.kind === "finalized") await store.delete(key);
      else {
        const next = { ...entry, departure: null };
        if (Object.keys(next.drafts).length === 0 && !next.inflight && !next.submission) await store.delete(key);
        else await store.put(key, next);
      }
    }
    return { ok: true as const };
  } catch {
    // Unavailable storage is already reported by the answering surface. A network failure must keep
    // a known pending event intact and prevent reacquisition, rather than silently discarding it.
    return studentFailure("unavailable");
  }
}
