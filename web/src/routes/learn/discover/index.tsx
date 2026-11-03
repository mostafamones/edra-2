import { createFileRoute } from "@tanstack/react-router";
import { LearningUnits } from "@/modules/learning";
import { searchRecord } from "@/routes/-functions/search";
import { loadStudentUnits } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/discover/")({ loaderDeps: ({ search }) => search, loader: ({ location }) => loadStudentUnits({ data: { query: searchRecord(location.searchStr), started: false } }), component: Page });
function Page() { return <LearningUnits data={Route.useLoaderData()} />; }
