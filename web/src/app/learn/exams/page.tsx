import { LearningExams, scopeParam } from "@/modules/learning";

export default async function ExamsPage({ searchParams }: PageProps<"/learn/exams">) {
  return <LearningExams scope={scopeParam(await searchParams)} />;
}
