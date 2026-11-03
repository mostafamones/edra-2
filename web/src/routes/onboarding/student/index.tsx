import { createFileRoute } from "@tanstack/react-router";
import { loadStudent } from "@/routes/-functions/shell";
import { StudentJoinPrompt, StudentOnboarding } from "@/modules/onboarding";
import { studentOnboardingCopy } from "@/modules/onboarding/copy/student";

export const Route = createFileRoute("/onboarding/student/")({ loader: () => loadStudent(), component: Page });
function Page() { const data = Route.useLoaderData(); return data.kind === "error" ? <main className="mx-auto flex min-h-svh max-w-xl items-center px-6"><p role="alert">{studentOnboardingCopy.loadError}</p></main> : data.kind === "join" ? <StudentJoinPrompt /> : <StudentOnboarding initialParentPhone={data.initialParentPhone} />; }
