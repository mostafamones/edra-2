import { createFileRoute } from "@tanstack/react-router";
import { ImportStudentsPage } from "@/modules/students/records/imports/components/page";

function Page() { return <ImportStudentsPage />; }

export const Route = createFileRoute("/app/$academySlug/students/import/")({ component: Page });
