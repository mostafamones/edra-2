import { z } from "zod";
import type { Command, Draft } from "./drafts";

/**
 * Pending exam work kept in this browser so a refresh or accidental close can recover it. One entry
 * per verified account and attempt holds only what recovery needs: drafts with their acknowledged
 * baselines, the immutable in-flight command, a submission intent and an undelivered departure.
 * Never questions, keys, solutions, auth tokens or editor tokens. Entries are removed on
 * acknowledgment of everything, on finalization and when another account (or nobody) is signed in.
 */

export const JOURNAL_SCHEMA = 2;

export type JournalEntry = {
  schema: typeof JOURNAL_SCHEMA;
  accountId: string;
  attemptId: string;
  examId: string;
  drafts: Record<string, Draft>;
  seq: number;
  inflight: Command | null;
  /** Confirmed submission: frozen answers flush, then this key is sent (and retried unchanged). */
  submission: { key: string | null; expectedVersion: number | null; generation: number } | null;
  /** A recorded-but-unacknowledged departure, redelivered with the same event id. */
  departure: { eventId: string; questionId: string; generation: number } | null;
  updatedAt: number;
};

/** Storage behind the journal; IndexedDB in the browser, memory in tests. */
export type JournalStore = {
  get(key: string): Promise<unknown>;
  put(key: string, value: JournalEntry): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

export const journalKey = (accountId: string, attemptId: string) => `${accountId}:${attemptId}`;

const answer = z.object({ choiceId: z.string().nullable(), text: z.string().max(10_000).nullable() }).strict();
const id = z.string().min(1);
const generation = z.number().int().positive();
const entrySchema = z.object({
  schema: z.literal(JOURNAL_SCHEMA), accountId: id, attemptId: id, examId: id,
  drafts: z.record(id, z.object({ value: answer, baseline: answer, seq: z.number().int().nonnegative() }).strict()),
  seq: z.number().int().nonnegative(),
  inflight: z.object({ key: id, generation, expectedVersion: z.number().int().nonnegative(),
    answers: z.array(z.union([
      z.object({ questionId: id, choiceId: id.nullable() }).strict(),
      z.object({ questionId: id, text: z.string().max(10_000).nullable() }).strict(),
    ])).min(1).max(300), seqs: z.record(id, z.number().int().nonnegative()),
  }).strict().nullable(),
  submission: z.object({ key: id.nullable(), expectedVersion: z.number().int().nonnegative().nullable(), generation }).strict().nullable(),
  departure: z.object({ eventId: id, questionId: id, generation }).strict().nullable(),
  updatedAt: z.number().finite(),
}).strict();

/**
 * The account's entry for an attempt. An entry of another schema or shape is discarded rather than
 * guessed at; `discarded` lets the caller say so.
 */
export async function readJournal(store: JournalStore, accountId: string, attemptId: string) {
  const key = journalKey(accountId, attemptId);
  const value = await store.get(key);
  if (value === undefined) return { entry: null, discarded: false };
  const parsed = entrySchema.safeParse(value);
  if (parsed.success && parsed.data.accountId === accountId && parsed.data.attemptId === attemptId) return { entry: parsed.data as JournalEntry, discarded: false };
  await store.delete(key);
  return { entry: null, discarded: true };
}

/** Removes every entry that does not belong to `accountId` (all of them when nobody is signed in). */
export async function purgeJournals(store: JournalStore, accountId: string | null) {
  const keys = await store.keys();
  await Promise.all(keys.filter((key) => !accountId || !key.startsWith(`${accountId}:`)).map((key) => store.delete(key)));
}

// ---------------------------------------------------------------------------------------------
// IndexedDB.

const DATABASE = "edra-exam-answers";
const STORE = "pending";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading later: close so it is not blocked; the next call reopens.
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed to open"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked"));
  }).catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  }));
}

export const indexedDbJournal: JournalStore = {
  get: (key) => run("readonly", (store) => store.get(key)),
  put: async (key, value) => { await run("readwrite", (store) => store.put(value, key)); },
  delete: async (key) => { await run("readwrite", (store) => store.delete(key)); },
  keys: async () => (await run("readonly", (store) => store.getAllKeys())).map(String),
};
