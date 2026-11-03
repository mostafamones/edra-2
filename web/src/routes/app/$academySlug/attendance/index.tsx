import { createFileRoute } from "@tanstack/react-router";
import { SessionsPage } from "@/modules/sessions/components/sessions-page";

function Page() { return <SessionsPage />; }

export const Route = createFileRoute("/app/$academySlug/attendance/")({ component: Page });
