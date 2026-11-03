import { createFileRoute } from "@tanstack/react-router";
import { StudentsPage } from "@/modules/students/records/components/students-page";

function Page() { return <StudentsPage />; }

export const Route = createFileRoute("/app/$academySlug/students/")({ component: Page });
