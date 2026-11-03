import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/student/exams/$examId/departure")({
  server: { handlers: {
    POST: async ({ request, params }) => (await import("@/modules/exams/student/departures/route")).departurePost(request, params.examId),
    OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "OPTIONS, POST" } }),
    ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
  } },
});
