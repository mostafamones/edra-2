import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentLearningUnit } from "@/modules/content";
import { UnitRouteError } from "@/routes/-components/student-errors";
import { loadStudentUnitRoute } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn/academy/$academySlug/units/$unitId")({ loader: ({ params }) => loadStudentUnitRoute({ data: params }), pendingMs: 0, pendingComponent: () => <main className="page-shell"><Skeleton className="h-10 w-64" /><Skeleton className="h-48" /><Skeleton className="h-64" /></main>, errorComponent: UnitRouteError, component: Page });
function Page() { const { academyId, academySlug, userId, unit } = Route.useLoaderData(); return <StudentLearningUnit academyId={academyId} academySlug={academySlug} userId={userId} initial={unit} />; }
