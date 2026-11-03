import { createFileRoute } from "@tanstack/react-router";
import { StudentAssignmentPage } from "@/modules/assignments/student/components/page";
import { loadStudentAssignmentRoute } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/academy/$academySlug/assignments/$assignmentId")({ loader: ({ params }) => loadStudentAssignmentRoute({ data: params }), component: Page });
function Page() { const { academy, data } = Route.useLoaderData(); return <StudentAssignmentPage academy={academy} data={data} />; }
