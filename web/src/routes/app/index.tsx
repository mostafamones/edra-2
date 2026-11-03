import { createFileRoute } from "@tanstack/react-router";
import { SuspendedAccess } from "@/modules/auth/components/suspended-access";
import { loadStaffEntry } from "@/routes/-functions/staff";

/** Only entry/legacy links select an academy; explicit slugs never reach this page. */
function StaffEntryPage() { return <SuspendedAccess {...Route.useLoaderData()} />; }
export const Route = createFileRoute("/app/")({
  loader: ({ location }) => loadStaffEntry({ data: location.publicHref.split("#", 1)[0] }),
  component: StaffEntryPage,
});
