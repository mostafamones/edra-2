import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/assignments/$assignmentId/student-resolution")({
  server: {
    handlers: {
      POST: async ({ request, params }) => (await import("@/lib/api/adapters/v1/assignments/[assignmentId]/student-resolution/handler.server")).POST(request, { params: Promise.resolve(params) }),
      OPTIONS: async ({ request }) => (await import("@/lib/api/adapters/v1/assignments/[assignmentId]/student-resolution/handler.server")).OPTIONS(request),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
