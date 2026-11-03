import { createFileRoute } from "@tanstack/react-router";
import { useSearchParams } from "@/lib/navigation";
import { StudentDetailsPage } from "@/modules/students/records/components/details-page";

function Page() {
  const { studentId } = Route.useParams();
  const values = useSearchParams().getAll("from");
  return <StudentDetailsPage recordId={studentId} returnQuery={values.length === 1 ? values[0] : ""} />;
}
export const Route = createFileRoute("/app/$academySlug/students/$studentId/")({ component: Page });
