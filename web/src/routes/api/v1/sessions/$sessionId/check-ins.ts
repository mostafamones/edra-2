import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/sessions/$sessionId/check-ins")({
  server: {
    handlers: {
      POST: async ({ request, params }) => (await import("@/lib/api/adapters/v1/sessions/[sessionId]/check-ins/handler.server")).POST(request, { params: Promise.resolve(params) }),
      OPTIONS: async ({ request }) => (await import("@/lib/api/adapters/v1/sessions/[sessionId]/check-ins/handler.server")).OPTIONS(request),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
