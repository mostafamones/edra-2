import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, readJson, snakeKeys, type ApiErrorCode } from "@/lib/api/http";
import { decodeCursor, MAX_PAGE_SIZE } from "./cursor";
import { getSession, listLiveSessions, sessionAcademy } from "./data";
import { runStartSession } from "./start";
import type { SessionDetail, SessionErrorCode } from "./types";

/** The sessions part of the external `/api/v1` contract (snake_case JSON). */

const statusCode = (status: 400 | 401 | 403 | 404 | 500) =>
  status === 400 ? "INVALID_REQUEST" : status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL";

export const readStatusError = (context: StaffApiContext, status: 400 | 401 | 403 | 404 | 500) => apiError(context, statusCode(status));

/** GET /api/v1/academies/{academyId}/sessions?state=live&cursor=&limit= */
export async function liveSessionsResponse(context: StaffApiContext, academyId: string, params: URLSearchParams) {
  const state = params.get("state");
  const cursor = params.get("cursor");
  const limitText = params.get("limit");
  const limit = limitText === null ? null : Number(limitText);
  if (!z.uuid().safeParse(academyId).success || (state !== null && state !== "live")
    || (cursor !== null && !decodeCursor(cursor))
    || (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE))) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listLiveSessions({ academyId, cursor, limit }, context.authority);
  if (!result.ok) return readStatusError(context, result.status);
  return apiJson(context, snakeKeys(result.data));
}

/**
 * Session snapshot, lifecycle and archival state without roster contact details; attendance has its
 * own endpoint. Archive management is web-only, so its trail and capabilities are not included.
 */
const WEB_ONLY = new Set<string>(["roster", "archiveEvents", "archiveImpact", "permittedActions", "yearOpen"] satisfies (keyof SessionDetail)[]);

export function sessionV1(detail: SessionDetail) {
  const session = Object.fromEntries(Object.entries(detail).filter(([key]) => !WEB_ONLY.has(key)));
  return snakeKeys({ ...session, rosterCount: detail.roster.length });
}

/**
 * Resolves a session's academy from its id for token clients. Unknown sessions and sessions in
 * academies the caller does not belong to are both 404, so existence is not disclosed.
 */
export async function withSessionAcademy(context: StaffApiContext, sessionId: string, handler: (academyId: string) => Promise<Response>) {
  const academyId = await sessionAcademy(sessionId, context.authority);
  return academyId ? handler(academyId) : apiError(context, "NOT_FOUND");
}

const START_CODES: Record<SessionErrorCode, ApiErrorCode> = {
  validation: "INVALID_REQUEST",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  schedule_unavailable: "SCHEDULE_UNAVAILABLE",
  year_unavailable: "YEAR_CLOSED",
  idempotency_conflict: "IDEMPOTENCY_CONFLICT",
  session_ended: "SESSION_ENDED",
  unavailable: "INTERNAL",
};

const startBody = z.object({ schedule_id: z.uuid() }).strict();

/**
 * POST /api/v1/academies/{academyId}/sessions — starts the schedule's session, or opens its live
 * one. The `Idempotency-Key` is the start key: a retry returns the original session (`replayed`),
 * even if it has since ended or been archived. 201 for a new session, 200 otherwise.
 */
export async function startSessionResponse(context: StaffApiContext, request: Request, academyId: string) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!z.uuid().safeParse(key).success) {
    return apiError(context, "INVALID_REQUEST", { message: "Send an Idempotency-Key header containing a UUID; reuse it when retrying." });
  }
  const body = startBody.safeParse(await readJson(request));
  if (!body.success || !z.uuid().safeParse(academyId).success) {
    return apiError(context, "INVALID_REQUEST", { message: "Send { \"schedule_id\": \"<uuid>\" }." });
  }
  const result = await runStartSession({ academyId, scheduleId: body.data.schedule_id, startKey: key }, context.authority);
  if (!result.ok) return apiError(context, START_CODES[result.code]);
  // Lifecycle is read after the start, so an auto-closed or archived original reports its current state.
  const detail = await getSession(academyId, result.sessionId, context.authority);
  if (!detail.ok) return readStatusError(context, detail.status);
  return apiJson(
    context,
    { outcome: result.outcome, replayed: result.outcome === "replayed", session: sessionV1(detail.data) },
    result.outcome === "started" ? 201 : 200,
  );
}
