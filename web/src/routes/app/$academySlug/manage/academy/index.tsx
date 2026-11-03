import { AcademyPending } from "@/routes/-components/academy-pending";
import { createFileRoute } from "@tanstack/react-router";
import { AcademyProfileSettings } from "@/modules/academies/profile";
import { YearLearningSettings } from "@/modules/academies/years";
import { loadAcademyProfile } from "@/routes/-functions/staff";

function Page() {
  const result = Route.useLoaderData();
  if (!result) return null;
  if (!result.profile) return <AcademyProfileSettings profile={null} />;
  return <><AcademyProfileSettings profile={result.profile} /><YearLearningSettings /></>;
}
export const Route = createFileRoute("/app/$academySlug/manage/academy/")({
  loader: async ({ params, parentMatchPromise }) => (await parentMatchPromise).loaderData?.status === "ok" ? loadAcademyProfile({ data: params.academySlug }) : null,
  pendingComponent: AcademyPending, pendingMs: 0, component: Page,
});
