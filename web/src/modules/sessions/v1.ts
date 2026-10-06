import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, snakeKeys } from "@/lib/api/http";
import { decodeCursor, MAX_PAGE_SIZE } from "./cursor";
import { listLiveSessions, sessionAcademy } from "./data";
import type { SessionDetail } from "./types";

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

/** Session snapshot and lifecycle without roster contact details; attendance has its own endpoint. */
export function sessionV1(detail: SessionDetail) {
  const { roster, ...session } = detail;
  return snakeKeys({ ...session, rosterCount: roster.length });
}

/**
 * Resolves a session's academy from its id for token clients. Unknown sessions and sessions in
 * academies the caller does not belong to are both 404, so existence is not disclosed.
 */
export async function withSessionAcademy(context: StaffApiContext, sessionId: string, handler: (academyId: string) => Promise<Response>) {
  const academyId = await sessionAcademy(sessionId, context.authority);
  return academyId ? handler(academyId) : apiError(context, "NOT_FOUND");
}
