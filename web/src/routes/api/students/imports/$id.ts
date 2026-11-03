import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/students/imports/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => (await import("@/lib/api/adapters/students/imports/[id]/handler.server")).GET(request, { params: Promise.resolve(params) }),
      OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } }),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
