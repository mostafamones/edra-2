import { createFileRoute } from "@tanstack/react-router";
import { SessionsPage } from "@/modules/sessions/components/sessions-page";

function Page() { return <SessionsPage startOpen />; }

export const Route = createFileRoute("/app/$academySlug/attendance/new/")({ component: Page });
