import { createFileRoute } from "@tanstack/react-router";
import { loadAcademyCreate } from "@/routes/-functions/shell";
import { AcademyCreation } from "@/modules/onboarding";

export const Route = createFileRoute("/onboarding/academy/create")({ loader: () => loadAcademyCreate(), component: Page });
function Page() { const data = Route.useLoaderData(); return <AcademyCreation userId={data} />; }
