import { createFileRoute } from "@tanstack/react-router";
import { StaffHomePage } from "@/modules/home";

function AppHomePage() {
  return <StaffHomePage />;
}

export const Route = createFileRoute("/app/$academySlug/")({ component: AppHomePage });
