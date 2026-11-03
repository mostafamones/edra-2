import { createFileRoute } from "@tanstack/react-router";
import { loadInstructorJoin } from "@/routes/-functions/shell";
import { InstructorJoin } from "@/modules/onboarding";

export const Route = createFileRoute("/onboarding/instructor/join")({ loader: () => loadInstructorJoin(), component: Page });
function Page() { const data = Route.useLoaderData(); return <InstructorJoin state={data} />; }
