import { notFound } from "next/navigation";
import { z } from "zod";
import { StudentLearningUnit } from "@/modules/content";
import { readLearningUnit } from "@/modules/content/server";
import { getMyStudentAcademy } from "@/modules/students/server";

export default async function StudentUnitPage({ params }: PageProps<"/learn/academy/[academySlug]/units/[unitId]">) {
  const { academySlug, unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const academy = await getMyStudentAcademy(academySlug);
  if (!academy || academy.access !== "active") notFound();
  const learning = await readLearningUnit({ academyId: academy.academy.id, unitId });
  return <StudentLearningUnit academyId={academy.academy.id} academySlug={academySlug} userId={learning.userId} initial={learning.unit} />;
}
