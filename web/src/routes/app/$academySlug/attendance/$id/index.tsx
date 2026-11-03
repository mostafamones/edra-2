import { createFileRoute } from "@tanstack/react-router";
import { AttendanceSection } from "@/modules/attendance/components/section";
import { SessionDetailsPage } from "@/modules/sessions/components/details-page";
import { ContentTaughtSection } from "@/modules/content";

function Page() {
  const { id } = Route.useParams();
  return <SessionDetailsPage id={id} content={<ContentTaughtSection sessionId={id} />} attendance={<AttendanceSection sessionId={id} />} />;
}

export const Route = createFileRoute("/app/$academySlug/attendance/$id/")({ component: Page });
