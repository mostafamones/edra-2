import { notFound } from "next/navigation";

import { AcademyProfileSettings, type AcademyProfile } from "@/modules/academies/profile";
import { getAcademyProfile } from "@/modules/academies/profile/server";
import { YearLearningSettings } from "@/modules/academies/years";

export default async function Page({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  let profile: AcademyProfile | null;
  try {
    profile = await getAcademyProfile(academySlug);
  } catch {
    return <AcademyProfileSettings profile={null} />;
  }
  // The layout already handles unknown and inaccessible academies; this covers a membership lost in between.
  if (!profile) notFound();
  return <><AcademyProfileSettings profile={profile} /><YearLearningSettings /></>;
}
