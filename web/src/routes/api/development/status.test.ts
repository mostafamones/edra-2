import { describe, expect, it } from "vitest";
import { Route } from "./status";

describe("development status route methods", () => {
  it("returns Next's automatic OPTIONS and rejects unsupported methods", async () => {
    const handlers = Route.options.server!.handlers as { OPTIONS: () => Response; ANY: (context: { request: Request }) => Response };
    const options = handlers.OPTIONS();
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    const unsupported = handlers.ANY({ request: new Request("https://example.test", { method: "DELETE" }) });
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("allow")).toBeNull();
  });
});
