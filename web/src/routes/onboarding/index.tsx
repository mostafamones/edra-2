import { createFileRoute } from "@tanstack/react-router";
import { loadOnboarding } from "@/routes/-functions/shell";
import { RoleChoice } from "@/modules/onboarding";
import { useSearchParams } from "@/lib/navigation";
import { searchRecord } from "@/routes/-functions/search";

export const Route = createFileRoute("/onboarding/")({ loader: () => loadOnboarding(), component: Page });
function Page() { return <RoleChoice initialScreen={searchRecord(useSearchParams().toString()).mode === "instructor" ? "instructor" : "role"} />; }
