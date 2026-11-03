import { createFileRoute } from "@tanstack/react-router";
import { StudentBookingPage } from "@/modules/students";

function Page() { return <StudentBookingPage />; }

export const Route = createFileRoute("/app/$academySlug/manage/bookings/")({ component: Page });
