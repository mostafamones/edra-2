import { createFileRoute } from "@tanstack/react-router";
import { StaffCalendarPage } from "@/modules/calendar/page";

function CalendarPage() {
  return <StaffCalendarPage />;
}

export const Route = createFileRoute("/app/$academySlug/calendar/")({ component: CalendarPage });
