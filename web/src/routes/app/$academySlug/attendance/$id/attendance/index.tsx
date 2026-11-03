import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@/lib/navigation";

import { staffAcademyPath } from "@/lib/routing";

/** Attendance now lives on the session page; keep older links working. */


export const Route = createFileRoute("/app/$academySlug/attendance/$id/attendance/")({ loader: async ({ params: { academySlug, id }, parentMatchPromise }) => (await parentMatchPromise).loaderData?.status === "ok" ? redirect(staffAcademyPath(academySlug, `/attendance/${encodeURIComponent(id)}`)) : undefined });
