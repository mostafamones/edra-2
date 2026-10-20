/**
 * Browser-side support for single-editor ownership. The server claim is the authority; these only
 * decide whether this document may present its stored claim token again after a refresh.
 *
 * A duplicated tab copies sessionStorage, so a stored token alone could hand a second tab a working
 * writer. The exclusive Web Lock settles it: only the document holding the lock for the exam may
 * reuse the stored token. A refresh releases the old document's lock before the new one asks; a
 * duplicate finds it taken and is treated as a second editor. Without Web Locks, no token is reused
 * and the document waits for the previous claim to expire instead.
 */

const name = (examId: string) => `edra:exam-editor:${examId}`;

export type EditorLock = { status: "held"; release: () => void } | { status: "taken" } | { status: "unsupported" };

export function acquireEditorLock(examId: string): Promise<EditorLock> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks?.request) return Promise.resolve({ status: "unsupported" });
  return new Promise<EditorLock>((resolve) => {
    locks.request(name(examId), { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve({ status: "taken" });
        return undefined;
      }
      // Held until released (or until this document goes away).
      return new Promise<void>((release) => resolve({ status: "held", release }));
    }).catch(() => resolve({ status: "unsupported" }));
  });
}

export function readRecoveryToken(examId: string): string | null {
  try {
    const value = window.sessionStorage.getItem(name(examId));
    return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeRecoveryToken(examId: string, token: string) {
  try { window.sessionStorage.setItem(name(examId), token); } catch { /* Storage may be unavailable: recovery then waits for expiry. */ }
}

export function clearRecoveryToken(examId: string) {
  try { window.sessionStorage.removeItem(name(examId)); } catch { /* Storage may be unavailable. */ }
}
