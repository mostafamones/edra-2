import { createFileRoute } from "@tanstack/react-router";
import { CouponsPage } from "@/modules/content";

function Page() { return <CouponsPage />; }

export const Route = createFileRoute("/app/$academySlug/manage/access/")({ component: Page });
