import { createFileRoute } from "@tanstack/react-router";
import { ContentEditorPage } from "@/modules/content";
function Page() {
  const { unitId } = Route.useParams();
  return <ContentEditorPage unitId={unitId} />;
}

export const Route = createFileRoute("/app/$academySlug/content/$unitId/")({ component: Page });
