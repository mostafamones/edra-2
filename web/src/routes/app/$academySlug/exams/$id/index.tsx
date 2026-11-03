import { createFileRoute } from "@tanstack/react-router";
import { ExamWorkspace } from "@/modules/exams/components/workspace/page";

function Page() {
  const { id } = Route.useParams();
  return <ExamWorkspace id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/exams/$id/")({ component: Page });
