import { createFileRoute } from "@tanstack/react-router";

import { notFound } from "@/lib/navigation";
import { isAcademyManager } from "@/modules/academies/roles";
import { useAuth } from "@/modules/auth";
import { QuestionBankPage } from "@/modules/question-bank/page";

function QuestionBank() {
  const academyId = Route.useLoaderData();
  const { academySlug } = Route.useParams();
  const { user } = useAuth();
  if (!academyId) return null;
  return <QuestionBankPage key={JSON.stringify([academyId, user?.id])} geminiAcademyId={import.meta.env.DEV ? academyId : undefined}
    bankScope={user ? { academyId, academySlug, accountId: user.id } : undefined} />;
}

export const Route = createFileRoute("/app/$academySlug/question-bank/")({
  loader: async ({ parentMatchPromise }) => {
    const result = (await parentMatchPromise).loaderData;
    if (result?.status !== "ok") return null;
    if (!isAcademyManager(result.academy.role)) notFound();
    return result.academy.id;
  },
  component: QuestionBank,
});
