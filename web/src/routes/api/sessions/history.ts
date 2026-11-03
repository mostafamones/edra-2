import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sessions/history")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/api/adapters/sessions/history/handler.server")).GET(request),
      OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } }),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
