import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/development/failures")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/api/adapters/development/failures/handler.server")).GET(request),
      POST: async ({ request }) => (await import("@/lib/api/adapters/development/failures/handler.server")).POST(request),
      OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS, POST" } }),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
