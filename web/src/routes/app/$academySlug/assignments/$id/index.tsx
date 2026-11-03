import { createFileRoute } from "@tanstack/react-router";
import { AssignmentWorkspace } from "@/modules/assignments/components/workspace/page";

function Page() {
  const { id } = Route.useParams();
  return <AssignmentWorkspace id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/assignments/$id/")({ component: Page });
