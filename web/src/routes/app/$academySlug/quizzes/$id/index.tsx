import { createFileRoute } from "@tanstack/react-router";
import { QuizWorkspace } from "@/modules/quizzes/components/workspace/page";

function Page() {
  const { id } = Route.useParams();
  return <QuizWorkspace id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/quizzes/$id/")({ component: Page });
