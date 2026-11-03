import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/assignments/$assignmentId/marks")({
  server: {
    handlers: {
      GET: async ({ request, params }) => (await import("@/lib/api/adapters/v1/assignments/[assignmentId]/marks/handler.server")).GET(request, { params: Promise.resolve(params) }),
      PATCH: async ({ request, params }) => (await import("@/lib/api/adapters/v1/assignments/[assignmentId]/marks/handler.server")).PATCH(request, { params: Promise.resolve(params) }),
      OPTIONS: async ({ request }) => (await import("@/lib/api/adapters/v1/assignments/[assignmentId]/marks/handler.server")).OPTIONS(request),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
