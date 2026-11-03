import { AcademyPending } from "@/routes/-components/academy-pending";
import { createFileRoute } from "@tanstack/react-router";
import { AcademyStructurePage } from "@/modules/academies/structure";
import { loadAcademyStructure } from "@/routes/-functions/staff";

function Page() {
  const result = Route.useLoaderData();
  const { academySlug } = Route.useParams();
  if (!result) return null;
  return <AcademyStructurePage slug={academySlug} initial={result.structure} />;
}
export const Route = createFileRoute("/app/$academySlug/manage/academy/structure/")({
  loader: async ({ params, parentMatchPromise }) => (await parentMatchPromise).loaderData?.status === "ok" ? loadAcademyStructure({ data: params.academySlug }) : null,
  pendingComponent: AcademyPending, pendingMs: 0, component: Page,
});
