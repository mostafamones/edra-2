import { clearBrowserQueryCache } from "@/lib/query-client";
import { setExamJournalAccount } from "@/modules/exams/browser";

import type { PreviewErrorCode, PreviewResult, PreviewStatus } from "./types";

export const PREVIEW_STATUS_KEY = ["development", "preview-status"] as const;
const CHANNEL = "edra-dev-preview";

export async function fetchPreviewStatus(signal?: AbortSignal): Promise<PreviewStatus> {
  const response = await fetch("/api/development/status", { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) return { available: false };
  return response.json();
}

export type PreviewAction = "enter" | "switch" | "return" | "exit";

export async function postPreview(action: PreviewAction, body: Record<string, unknown>): Promise<PreviewResult> {
  try {
    const response = await fetch(`/api/development/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** Tells other tabs of this browser that the signed-in identity changed. */
export function announceIdentityChange() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("identity-changed");
    channel.close();
  } catch {
    // BroadcastChannel is unavailable; other tabs keep their view until reloaded.
  }
}

export function onIdentityChange(listener: () => void): () => void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (event.data === "identity-changed") listener();
    };
    return () => channel.close();
  } catch {
    return () => {};
  }
}

/** Drops client state from the previous identity before the browser loads the next one. */
export async function leaveForIdentity(destination: string) {
  clearBrowserQueryCache();
  await setExamJournalAccount(null);
  announceIdentityChange();
  window.location.assign(destination);
}

export function previewErrorMessage(error: PreviewErrorCode): string {
  switch (error) {
    case "stale":
    case "conflict":
    case "busy":
    case "session_mismatch":
      return "Preview changed in another tab. Try again.";
    case "session_inactive":
    case "original_unavailable":
    case "inactive":
      return "Preview ended. Sign in again.";
    default:
      return "Couldn't switch identity.";
  }
}

/** Pure resolver: which Developer mode action brings a generated student record into view, if any. */
export function viewAsStudentRequest(
  status: PreviewStatus | undefined,
  recordId: string,
  returnTo: string,
): { action: "enter" | "switch"; body: Record<string, unknown> } | null {
  if (!status?.available || !status.run) return null;
  const student = status.students.find((entry) => entry.recordId === recordId);
  if (!student) return null;
  if (!status.active) return { action: "enter", body: { runId: status.run.id, studentLogicalId: student.logicalId, returnTo } };
  if (status.current.kind === "student") return null;
  return {
    action: "switch",
    body: { runId: status.run.id, logicalId: student.logicalId, expectedRevision: status.revision, returnTo },
  };
}
