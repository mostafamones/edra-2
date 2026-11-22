import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { useAuth } from "@/modules/auth";
import { QuestionImportPage } from "@/modules/question-bank/import";
import { managerAcademy } from "./-scope";

function QuestionImport() {
  const academyId = Route.useLoaderData();
  const { academySlug } = Route.useParams();
  const { user } = useAuth();
  if (!academyId) return null;
  // Remounting on academy or account change discards the in-memory review and its caches.
  return <>
    <BreadcrumbTitle title="Import PDF" />
    <QuestionImportPage key={JSON.stringify([academyId, user?.id])} geminiAcademyId={import.meta.env.DEV ? academyId : undefined}
      bankScope={user ? { academyId, academySlug, accountId: user.id } : undefined} />
  </>;
}

export const Route = createFileRoute("/app/$academySlug/question-bank/import")({
  loader: async ({ parentMatchPromise }) => managerAcademy((await parentMatchPromise).loaderData),
  component: QuestionImport,
});
