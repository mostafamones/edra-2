import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@/lib/navigation";
import { academyListRedirect } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/academy/$academySlug/assignments/")({ loader: async ({ params, location, parentMatchPromise }) => { if ((await parentMatchPromise)?.status !== "success") return; redirect(academyListRedirect("assignments", params.academySlug, location.searchStr)); } });
