import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@/lib/navigation";

import { staffAcademyPath } from "@/lib/routing";

// The staff list is the shared Assessments page; keep older links working with this type selected.


export const Route = createFileRoute("/app/$academySlug/assignments/")({ loader: async ({ params: { academySlug }, parentMatchPromise }) => (await parentMatchPromise).loaderData?.status === "ok" ? redirect(staffAcademyPath(academySlug, "/assessments?type=assignment")) : undefined });
