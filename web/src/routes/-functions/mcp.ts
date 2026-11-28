import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const loadMcpConsent = createServerFn({ method: "GET" })
  .validator(z.object({ query: z.string().max(1100) }))
  .handler(async ({ data }) => (await import("@/lib/mcp/oauth.server")).loadMcpConsent(data));
