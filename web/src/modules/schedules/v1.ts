import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, snakeKeys } from "@/lib/api/http";
import { listStartableSchedules, MAX_SCHEDULE_PAGE, MAX_SCHEDULE_SEARCH } from "./data";

/** The schedules part of the external `/api/v1` contract (snake_case JSON). */

const intParam = (value: string | null) => (value === null ? null : /^\d{1,6}$/.test(value) ? Number(value) : Number.NaN);

/** GET /api/v1/academies/{academyId}/schedules?q=&limit=&offset= */
export async function schedulesResponse(context: StaffApiContext, academyId: string, params: URLSearchParams) {
  const search = params.get("q");
  const limit = intParam(params.get("limit"));
  const offset = intParam(params.get("offset"));
  if (!z.uuid().safeParse(academyId).success || (search !== null && search.length > MAX_SCHEDULE_SEARCH)
    || (limit !== null && !(limit >= 1 && limit <= MAX_SCHEDULE_PAGE)) || (offset !== null && !(offset >= 0))) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listStartableSchedules({ academyId, search, limit, offset }, context.authority);
  if (!result.ok) return apiError(context, result.status === 400 ? "INVALID_REQUEST" : result.status === 403 ? "FORBIDDEN" : "INTERNAL");
  return apiJson(context, snakeKeys(result.data));
}
