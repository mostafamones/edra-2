import type { LiveSessionPage, PastSessionPage, SessionDetail } from "./types";

// Every key is prefixed by ["sessions", academyId] so one invalidation covers an academy's session data.
export const sessionsRootKey = (academyId: string) => ["sessions", academyId] as const;
export const liveSessionsQueryKey = (academyId: string) => [...sessionsRootKey(academyId), "live"] as const;
export type HistoryFilter = { search: string; from: string | null; to: string | null };
export const historyQueryKey = (academyId: string, filter: HistoryFilter) => [...sessionsRootKey(academyId), "history", filter.search, filter.from, filter.to] as const;
export const sessionQueryKey = (academyId: string, sessionId: string) =>
  [...sessionsRootKey(academyId), "detail", sessionId] as const;

export class SessionRequestError extends Error {
  constructor(readonly status: number) {
    super(`Session request failed with status ${status}`);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new SessionRequestError(response.status);
  return response.json() as Promise<T>;
}

/** One page of the academy's live sessions from the authenticated endpoint. */
export function fetchLiveSessions(academyId: string, cursor: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ academy: academyId });
  if (cursor) query.set("cursor", cursor);
  return getJson<LiveSessionPage>(`/api/sessions?${query}`, signal);
}

/** One page of ended sessions, optionally searched and limited to a range of days. */
export function fetchSessionHistory(academyId: string, filter: HistoryFilter, cursor: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ academy: academyId });
  if (filter.search) query.set("q", filter.search);
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  if (cursor) query.set("cursor", cursor);
  return getJson<PastSessionPage>(`/api/sessions/history?${query}`, signal);
}

/** One session and its roster. */
export function fetchSession(academyId: string, sessionId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ academy: academyId });
  return getJson<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}?${query}`, signal);
}
