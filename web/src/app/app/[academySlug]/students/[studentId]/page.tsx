import { StudentDetailsPage } from "@/modules/students/records/components/details-page";

export default async function Page({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ from?: string }> }) {
  const { studentId } = await params;
  const { from } = await searchParams;
  return <StudentDetailsPage recordId={studentId} returnQuery={typeof from === "string" ? from : ""} />;
}
