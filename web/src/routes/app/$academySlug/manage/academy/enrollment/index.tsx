import { AcademyPending } from "@/routes/-components/academy-pending";
import { createFileRoute } from "@tanstack/react-router";
import { StudentEnrollmentPage } from "@/modules/students";

function Page() { return <StudentEnrollmentPage />; }

export const Route = createFileRoute("/app/$academySlug/manage/academy/enrollment/")({ component: Page, pendingComponent: AcademyPending, pendingMs: 0 });
