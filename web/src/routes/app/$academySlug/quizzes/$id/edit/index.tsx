import { createFileRoute } from "@tanstack/react-router";
import { EditQuizPage } from "@/modules/quizzes/components/editor/page";

function Page() {
  const { id } = Route.useParams();
  return <EditQuizPage id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/quizzes/$id/edit/")({ component: Page });
