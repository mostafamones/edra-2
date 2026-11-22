import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/academies/$academyId/students/$recordId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => (await import("@/lib/api/adapters/v1/academies/[academyId]/students/[recordId]/handler.server")).GET(request, { params: Promise.resolve(params) }),
      OPTIONS: async ({ request }) => (await import("@/lib/api/adapters/v1/academies/[academyId]/students/[recordId]/handler.server")).OPTIONS(request),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
