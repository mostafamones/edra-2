import { createFileRoute } from "@tanstack/react-router";
import { NewAssignmentPage } from "@/modules/assignments/components/editor/new";

function Page() { return <NewAssignmentPage />; }

export const Route = createFileRoute("/app/$academySlug/assignments/new/")({ component: Page });
