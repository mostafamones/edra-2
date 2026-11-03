import { createFileRoute } from "@tanstack/react-router";
import { EditExamPage } from "@/modules/exams/components/editor/page";

function Page() {
  const { id } = Route.useParams();
  return <EditExamPage id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/exams/$id/edit/")({ component: Page });
