import { notFound } from "next/navigation";

import { StudentAcademyHome } from "@/modules/students";
import { getMyStudentAcademy } from "@/modules/students/server";
import { LearningBrowse } from "@/modules/content";
import { readLearningList } from "@/modules/content/server";

/** Academy home for a connected student. Unconnected accounts and deeper academy pages are not found. */
export default async function AcademyLearningPage({ params }: PageProps<"/learn/academy/[academySlug]/[[...path]]">) {
  const { academySlug, path } = await params;
  if (path?.length) notFound();
  const academy = await getMyStudentAcademy(academySlug);
  if (!academy) notFound();
  if (academy.access !== "active") return <StudentAcademyHome academy={academy} />;
  const learning = await readLearningList({ academyId: academy.academy.id });
  return <LearningBrowse academyId={academy.academy.id} academySlug={academySlug} academyName={academy.academy.name}
    placement={[academy.record?.levelName, academy.record?.trackName].filter(Boolean).join(" · ")} userId={learning.userId} initial={learning.page} />;
}
