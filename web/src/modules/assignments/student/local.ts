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
export type LocalDraft = { generation: number; baseVersion: number; pending: Answers; operation: PendingOperation | null };

const draftKey = (userId: string, assignmentId: string) => `${DRAFT}${userId}:${assignmentId}`;

export function loadLocalDraft(userId: string, assignmentId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId, assignmentId));
    if (!raw) return null;
    const value = JSON.parse(raw) as LocalDraft;
    return typeof value.generation === "number" && typeof value.baseVersion === "number" && value.pending && typeof value.pending === "object" ? value : null;
  } catch {
    return null;
  }
}

/** False when the browser refused to store it (the status then says "Not kept on this device"). */
export function storeLocalDraft(userId: string, assignmentId: string, draft: LocalDraft): boolean {
  try {
    if (Object.keys(draft.pending).length === 0 && !draft.operation) window.localStorage.removeItem(draftKey(userId, assignmentId));
    else window.localStorage.setItem(draftKey(userId, assignmentId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(userId: string, assignmentId: string) {
  try { window.localStorage.removeItem(draftKey(userId, assignmentId)); } catch { /* Storage may be blocked. */ }
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

/**
 * How locally pending choices reconcile with the claimed server draft. Only the same generation
 * at the same acknowledged version may continue; newer server work or another editor wins.
 */
export function reconcile(local: LocalDraft | null, server: { generation: number; version: number }): "resume" | "discard" | "none" {
  if (!local || (Object.keys(local.pending).length === 0 && !local.operation)) return "none";
  if (local.generation !== server.generation) return "discard";
  // A save whose response was lost may already be applied: its exact retry replays the receipt.
  if (local.baseVersion === server.version || (local.operation?.kind === "save" && local.baseVersion + 1 === server.version)) return "resume";
  return "discard";
}
