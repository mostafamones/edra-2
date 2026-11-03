import { createFileRoute } from "@tanstack/react-router";
import { AssessmentsPage } from "@/modules/assessments";

function Page() { return <AssessmentsPage />; }

export const Route = createFileRoute("/app/$academySlug/assessments/")({ component: Page });
