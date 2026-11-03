import { createFileRoute } from "@tanstack/react-router";
import { notFound } from "@/lib/navigation";
export const Route = createFileRoute("/learn/academy/$academySlug/$")({ loader: async ({ parentMatchPromise }) => { if ((await parentMatchPromise)?.status === "success") notFound(); } });
