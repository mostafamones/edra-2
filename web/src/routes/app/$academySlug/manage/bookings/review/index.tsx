import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@/lib/navigation";

import { staffAcademyPath } from "@/lib/routing";

// Bookings register students directly; there is no review queue. Keep older links working.


export const Route = createFileRoute("/app/$academySlug/manage/bookings/review/")({ loader: async ({ params: { academySlug }, parentMatchPromise }) => (await parentMatchPromise).loaderData?.status === "ok" ? redirect(staffAcademyPath(academySlug, "/manage/bookings")) : undefined });
