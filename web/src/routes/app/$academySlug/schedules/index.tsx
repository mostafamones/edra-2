import { createFileRoute } from "@tanstack/react-router";
import { SchedulesPage } from "@/modules/schedules/components/schedules-page";

function Page() { return <SchedulesPage />; }


export const Route = createFileRoute("/app/$academySlug/schedules/")({ component: Page });
