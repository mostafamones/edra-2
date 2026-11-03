import { createFileRoute } from "@tanstack/react-router";
import { notFound } from "@/lib/navigation";
import { PagePreviewView } from "@/modules/navigation/components/preview";
import { findStudentItem } from "@/modules/navigation/manifest";
export const Route = createFileRoute("/learn/$")({
  loader: async ({ params, parentMatchPromise }) => { if ((await parentMatchPromise)?.status !== "success") return; if (!findStudentItem(`/learn/${params._splat}`)?.preview) notFound(); },
  component: Page,
});
function Page() { return <PagePreviewView preview={findStudentItem(`/learn/${Route.useParams()._splat}`)!.preview!} />; }
