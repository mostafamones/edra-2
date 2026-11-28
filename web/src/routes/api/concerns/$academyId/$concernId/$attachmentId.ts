import { createFileRoute } from "@tanstack/react-router";

/** Concern media delivery: rechecks current concern access and message state on every request. */
export const Route = createFileRoute("/api/concerns/$academyId/$concernId/$attachmentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => (await import("@/modules/concerns/media.server")).serveConcernMedia(request, params),
      OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } }),
      ANY: ({ request }) => new Response(null, { status: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? 405 : 400 }),
    },
  },
});
