import { createFileRoute } from "@tanstack/react-router";
import { NewStudentPage } from "@/modules/students/records/components/new-page";

function Page() { return <NewStudentPage />; }

export const Route = createFileRoute("/app/$academySlug/students/new/")({ component: Page });
