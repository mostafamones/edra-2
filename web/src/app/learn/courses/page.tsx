import { LearningUnits, scopeParam, unitListParams } from "@/modules/learning";

export default async function CoursesPage({ searchParams }: PageProps<"/learn/courses">) {
  const query = await searchParams;
  return <LearningUnits started {...unitListParams(query)} scope={scopeParam(query)} />;
}
