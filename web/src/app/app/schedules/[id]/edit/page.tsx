import { EditSchedulePage } from "@/modules/schedules/components/edit-schedule-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditSchedulePage id={id} />;
}
