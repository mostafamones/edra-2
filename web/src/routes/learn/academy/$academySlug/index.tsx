import { createFileRoute } from "@tanstack/react-router";
import { StudentAcademyHome } from "@/modules/students";
import { loadStudentAcademy } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/academy/$academySlug/")({ loader: ({ params }) => loadStudentAcademy({ data: params.academySlug }), component: Page });
function Page() { return <StudentAcademyHome academy={Route.useLoaderData()} />; }
