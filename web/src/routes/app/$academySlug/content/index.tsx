import { createFileRoute } from "@tanstack/react-router";
import { ContentWorkspacePage } from "@/modules/content";
function Page() { return <ContentWorkspacePage />; }

export const Route = createFileRoute("/app/$academySlug/content/")({ component: Page });
