import { createFileRoute } from "@tanstack/react-router";
import { NewQuizPage } from "@/modules/quizzes/components/editor/page";

function Page() { return <NewQuizPage />; }

export const Route = createFileRoute("/app/$academySlug/quizzes/new/")({ component: Page });
