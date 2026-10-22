"use client";

import { newUuid } from "@/lib/uuid";
import type { Answers } from "./types";

/**
 * Browser-side draft safety for one account and assignment. Pending choices and the one uncertain
 * command are kept until the server acknowledges them; they are never accepted work. Keys carry the
 * account id so another account never sees or replays them.
 */

const DRAFT = "edra:assignment-draft:";
const EDITOR = "edra:assignment-editor:";

/** An uncertain command: retried with its exact identity and payload, never rebuilt. */
export type PendingOperation = { kind: "save" | "submit"; payload: Record<string, unknown> };
/**
 * `pending` awaits saving under `generation`; `conflicts` are this device's choices that differ
 * from newer saved work and wait for the student to keep or discard each one.
 */
export type LocalDraft = { generation: number; baseVersion: number; pending: Answers; conflicts: Answers; operation: PendingOperation | null };

const draftKey = (userId: string, recordId: string, assignmentId: string) => `${DRAFT}${userId}:${recordId}:${assignmentId}`;
const empty = (draft: LocalDraft) => Object.keys(draft.pending).length === 0 && Object.keys(draft.conflicts).length === 0 && !draft.operation;

export function loadLocalDraft(userId: string, recordId: string, assignmentId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId, recordId, assignmentId));
    if (!raw) return null;
    const value = JSON.parse(raw) as LocalDraft;
    if (typeof value.generation !== "number" || typeof value.baseVersion !== "number" || !value.pending || typeof value.pending !== "object") return null;
    return { ...value, conflicts: value.conflicts && typeof value.conflicts === "object" ? value.conflicts : {} };
  } catch {
    return null;
  }
}

/** False when the browser refused to store it (the status then says "Not kept on this device"). */
export function storeLocalDraft(userId: string, recordId: string, assignmentId: string, draft: LocalDraft): boolean {
  try {
    if (empty(draft)) window.localStorage.removeItem(draftKey(userId, recordId, assignmentId));
    else window.localStorage.setItem(draftKey(userId, recordId, assignmentId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(userId: string, recordId: string, assignmentId: string) {
  try { window.localStorage.removeItem(draftKey(userId, recordId, assignmentId)); } catch { /* Storage may be blocked. */ }
}

/** This device's choices that differ from the saved answers (a blank is null either way). */
export function conflictsAgainst(candidate: Answers, saved: Answers): Answers {
  return Object.fromEntries(Object.entries(candidate).filter(([id, value]) => (saved[id] ?? null) !== value));
}

/**
 * How local data reconciles with the claimed server draft. The same generation at the acknowledged
 * version (or one save ahead, when that save's response was lost) resumes and replays exactly.
 * Anything else never replays: differing choices become per-question conflicts for the student.
 */
export function reconcile(local: LocalDraft | null, server: { generation: number; version: number; answers: Answers }):
  { kind: "none" } | { kind: "resume"; draft: LocalDraft } | { kind: "conflicts"; conflicts: Answers } {
  if (!local || empty(local)) return { kind: "none" };
  const conflicts = conflictsAgainst(local.conflicts, server.answers);
  if (local.generation === server.generation
    && (local.baseVersion === server.version || (local.operation?.kind === "save" && local.baseVersion + 1 === server.version))) {
    return { kind: "resume", draft: { ...local, conflicts } };
  }
  const all = conflictsAgainst({ ...local.conflicts, ...local.pending }, server.answers);
  return Object.keys(all).length ? { kind: "conflicts", conflicts: all } : { kind: "none" };
}

/** This tab's editor identity. A refresh keeps it (same tab recovers its claim); another tab gets its own. */
export function editorToken(userId: string, assignmentId: string): string {
  const key = `${EDITOR}${userId}:${assignmentId}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const token = newUuid();
    window.sessionStorage.setItem(key, token);
    return token;
  } catch {
    return newUuid();
  }
}

/** Removes every other account's assignment drafts and editor tokens (sign-out or account change). */
export function purgeAssignmentDrafts(account: string | null) {
  for (const storage of [safe(() => window.localStorage), safe(() => window.sessionStorage)]) {
    if (!storage) continue;
    try {
      for (const key of Object.keys(storage)) {
        if ((key.startsWith(DRAFT) || key.startsWith(EDITOR)) && (!account || !key.slice(key.indexOf(":", 6) + 1).startsWith(`${account}:`))) {
          storage.removeItem(key);
        }
      }
    } catch { /* Storage may be blocked. */ }
  }
}

function safe<T>(read: () => T): T | null {
  try { return read(); } catch { return null; }
}

