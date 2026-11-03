import { createFileRoute } from "@tanstack/react-router";
import { NewSchedulePage } from "@/modules/schedules/components/new-schedule-page";

function Page() { return <NewSchedulePage />; }

export const Route = createFileRoute("/app/$academySlug/schedules/new/")({ component: Page });
