import "@tanstack/react-start/server-only";
import { withStaffApi } from "@/lib/api/handler";
import { apiJson, preflight, snakeKeys } from "@/lib/api/http";
import { readOwnProfile } from "@/modules/account/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/me — the signed-in account's own name and a short-lived picture URL. */
export function GET(request: Request) {
  return withStaffApi(request, METHODS, "read", async (context) => apiJson(context, snakeKeys(await readOwnProfile(context.authority))));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
