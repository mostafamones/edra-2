import { EditAssignmentPage } from "@/modules/assignments/components/edit";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditAssignmentPage id={id} />;
}
