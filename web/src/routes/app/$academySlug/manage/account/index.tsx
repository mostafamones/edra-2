import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/modules/account";

/** Personal settings are global; the academy layout only supplies the shell and already requires staff membership. */
function Page() { return <AccountSettings />; }

export const Route = createFileRoute("/app/$academySlug/manage/account/")({ component: Page });
