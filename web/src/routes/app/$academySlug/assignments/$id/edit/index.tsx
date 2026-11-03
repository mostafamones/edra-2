import { createFileRoute } from "@tanstack/react-router";
import { EditAssignmentPage } from "@/modules/assignments/components/editor/edit";

function Page() {
  const { id } = Route.useParams();
  return <EditAssignmentPage id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/assignments/$id/edit/")({ component: Page });
