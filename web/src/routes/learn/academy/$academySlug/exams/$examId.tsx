import { createFileRoute } from "@tanstack/react-router";
import { StudentExamsLoading } from "@/modules/exams";
import { ExamsRouteError } from "@/routes/-components/student-errors";
import { StudentExamOverviewPage } from "@/modules/exams/student/components/overview";
import { loadStudentExamRoute } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/academy/$academySlug/exams/$examId")({ loader: ({ params }) => loadStudentExamRoute({ data: params }), pendingMs: 0, pendingComponent: StudentExamsLoading, errorComponent: ExamsRouteError, component: Page });
function Page() { const { academy, data } = Route.useLoaderData(); return <StudentExamOverviewPage academy={academy} data={data} />; }
