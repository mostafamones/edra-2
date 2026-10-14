import { EditQuizPage } from "@/modules/quizzes/components/editor/page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditQuizPage id={id} />;
}
