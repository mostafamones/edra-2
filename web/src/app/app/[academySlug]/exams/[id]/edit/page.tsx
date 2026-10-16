import { EditExamPage } from "@/modules/exams/components/editor/page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditExamPage id={id} />;
}
