import { AttendanceSection } from "@/modules/attendance/components/section";
import { SessionDetailsPage } from "@/modules/sessions/components/details-page";
import { ContentTaughtSection } from "@/modules/content";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetailsPage id={id} content={<ContentTaughtSection sessionId={id} />} attendance={<AttendanceSection sessionId={id} />} />;
}
