import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/api/adapters/v1/me/handler.server")).GET(request),
      OPTIONS: async ({ request }) => (await import("@/lib/api/adapters/v1/me/handler.server")).OPTIONS(request),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
