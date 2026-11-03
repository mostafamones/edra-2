import { createFileRoute } from "@tanstack/react-router";
import { ImportLogsPage } from "@/modules/students/records/imports/components/logs";

function Page() { return <ImportLogsPage />; }

export const Route = createFileRoute("/app/$academySlug/students/imports/")({ component: Page });
