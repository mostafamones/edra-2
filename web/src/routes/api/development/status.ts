import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/development/status")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/api/adapters/development/status/handler.server")).GET(),
      OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } }),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
