import { withStaffApi } from "@/lib/api/handler";
import { apiJson, preflight } from "@/lib/api/http";
import { listStaffAcademies } from "@/modules/academies/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies — academies the signed-in staff member may access. */
export function GET(request: Request) {
  return withStaffApi(request, METHODS, "read", async (context) => {
    const academies = await listStaffAcademies(context.authority);
    return apiJson(context, { academies: academies.map(({ id, name, slug, icon, role }) => ({ id, name, slug, icon, role })) });
  });
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
