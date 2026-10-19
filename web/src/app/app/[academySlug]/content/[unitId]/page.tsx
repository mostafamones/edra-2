import { ContentEditorPage } from "@/modules/content";
export default async function Page({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  return <ContentEditorPage unitId={unitId} />;
}
