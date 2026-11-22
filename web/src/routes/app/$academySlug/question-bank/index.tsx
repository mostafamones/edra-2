import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/modules/auth";
import { QuestionLibraryPage } from "@/modules/question-bank/library";
import { managerAcademy } from "./-scope";

function QuestionBank() {
  const academyId = Route.useLoaderData();
  const { academySlug } = Route.useParams();
  const { user } = useAuth();
  if (!academyId || !user) return null;
  return <QuestionLibraryPage key={JSON.stringify([academyId, user.id])} scope={{ academyId, academySlug, accountId: user.id }} />;
}

export const Route = createFileRoute("/app/$academySlug/question-bank/")({
  loader: async ({ parentMatchPromise }) => managerAcademy((await parentMatchPromise).loaderData),
  component: QuestionBank,
});
