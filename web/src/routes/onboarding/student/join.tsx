import { createFileRoute } from "@tanstack/react-router";
import { loadStudentJoin } from "@/routes/-functions/shell";
import { StudentJoin } from "@/modules/onboarding";

export const Route = createFileRoute("/onboarding/student/join")({ loader: () => loadStudentJoin(), component: Page });
function Page() { const data = Route.useLoaderData(); return <StudentJoin state={data} />; }
