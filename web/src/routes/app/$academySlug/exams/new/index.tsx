import { createFileRoute } from "@tanstack/react-router";
import { NewExamPage } from "@/modules/exams/components/editor/page";

function Page() { return <NewExamPage />; }

export const Route = createFileRoute("/app/$academySlug/exams/new/")({ component: Page });
