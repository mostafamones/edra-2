import { createFileRoute } from "@tanstack/react-router";
import { LearningHome } from "@/modules/learning";
import { loadStudentHome } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/")({ loader: () => loadStudentHome(), component: Page });
function Page() { return <LearningHome data={Route.useLoaderData()} />; }
