import { createFileRoute } from "@tanstack/react-router";
import { StudentExamsLoading } from "@/modules/exams";
import { ExamsRouteError } from "@/routes/-components/student-errors";
import { redirect } from "@/lib/navigation";
import { academyListRedirect } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/academy/$academySlug/exams/")({ loader: async ({ params, location, parentMatchPromise }) => { if ((await parentMatchPromise)?.status !== "success") return; redirect(academyListRedirect("exams", params.academySlug, location.searchStr)); }, pendingMs: 0, pendingComponent: StudentExamsLoading, errorComponent: ExamsRouteError });
