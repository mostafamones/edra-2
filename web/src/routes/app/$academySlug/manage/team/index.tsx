import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/modules/staff";

function Page() { return <TeamPage />; }

export const Route = createFileRoute("/app/$academySlug/manage/team/")({ component: Page });
