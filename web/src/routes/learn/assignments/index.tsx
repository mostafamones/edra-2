import { createFileRoute } from "@tanstack/react-router";
import { LearningAssignments } from "@/modules/learning";
import { searchRecord } from "@/routes/-functions/search";
import { loadStudentAssignments } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/assignments/")({ loaderDeps: ({ search }) => search, loader: ({ location }) => loadStudentAssignments({ data: searchRecord(location.searchStr) }), component: Page });
function Page() { return <LearningAssignments data={Route.useLoaderData()} />; }
