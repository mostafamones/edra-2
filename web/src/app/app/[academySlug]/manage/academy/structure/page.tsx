import { notFound } from "next/navigation";

import { AcademyStructurePage, type AcademyStructure } from "@/modules/academies/structure";
import { getStructure } from "@/modules/academies/structure/server";

export default async function Page({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  let structure: AcademyStructure | null;
  try { structure = await getStructure(academySlug); }
  catch { return <AcademyStructurePage slug={academySlug} initial={null} />; }
  if (!structure) notFound();
  return <AcademyStructurePage slug={academySlug} initial={structure} />;
}
