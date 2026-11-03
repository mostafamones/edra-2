import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/navigation";
import { StudentExamsError } from "@/modules/exams";

// Router's `reset` only clears the boundary; a failed loader's match stays in error until it reloads.
export function ExamsRouteError() {
  const { refresh } = useRouter();
  return <StudentExamsError retry={refresh} />;
}
export function UnitRouteError() {
  const { refresh } = useRouter();
  return <main className="page-shell"><p role="alert">Could not load this unit.</p><Button variant="outline" onClick={refresh}>Retry</Button></main>;
}
