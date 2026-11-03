import { createFileRoute } from "@tanstack/react-router";
import { LearningExams } from "@/modules/learning";
import { searchRecord } from "@/routes/-functions/search";
import { loadStudentExams } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/exams/")({ loaderDeps: ({ search }) => search, loader: ({ location }) => loadStudentExams({ data: searchRecord(location.searchStr) }), component: Page });
function Page() { return <LearningExams data={Route.useLoaderData()} />; }
