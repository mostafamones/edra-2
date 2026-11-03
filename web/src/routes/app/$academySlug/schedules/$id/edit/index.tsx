import { createFileRoute } from "@tanstack/react-router";
import { EditSchedulePage } from "@/modules/schedules/components/edit-schedule-page";

function Page() {
  const { id } = Route.useParams();
  return <EditSchedulePage id={id} />;
}

export const Route = createFileRoute("/app/$academySlug/schedules/$id/edit/")({ component: Page });
