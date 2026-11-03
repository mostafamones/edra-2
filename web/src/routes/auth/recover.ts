import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/recover")({
  server: { handlers: {
    POST: async ({ request }) => (await import("@/lib/api/adapters/auth/recover/handler.server")).POST(request),
    OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "OPTIONS, POST" } }),
    ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
  } },
});
