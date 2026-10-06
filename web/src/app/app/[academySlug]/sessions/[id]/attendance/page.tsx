import { AttendancePage } from "@/modules/attendance/components/attendance-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AttendancePage sessionId={id} />;
}
