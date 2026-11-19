import { describe, expect, it } from "vitest";

const modules = import.meta.glob([
  "./**/*.ts",
  "../auth/recover.ts",
  "../auth/recover/verify.ts",
  "../auth/signout.ts",
  "../invite/staff/$token.ts",
  "../invite/student/$token.ts",
  "../invite/booking/$token/join.ts",
  "!./**/*.test.ts",
], { eager: true }) as Record<string, { Route: { options: { server?: { handlers?: unknown } } } }>;

describe("HTTP route method responses", () => {
  it("covers all 47 handlers", () => {
    expect(Object.keys(modules)).toHaveLength(47);
  });

  it.each(Object.entries(modules))("returns the baseline empty 405 for %s", (_path, module) => {
    const handlers = module.Route.options.server!.handlers as { ANY: (context: { request: Request }) => Response };
    const response = handlers.ANY({ request: new Request("https://example.test", { method: "DELETE" }) });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBeNull();
    expect(response.body).toBeNull();
    expect(handlers.ANY({ request: new Request("https://example.test", { method: "PROPFIND" }) }).status).toBe(400);
  });

  it.each(Object.entries(modules).filter(([path]) => !path.startsWith("./v1/")))(
    "returns automatic OPTIONS for %s", (_path, module) => {
      const handlers = module.Route.options.server!.handlers as Record<string, () => Response>;
      const response = handlers.OPTIONS();
      const methods = ["OPTIONS", ...["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD"].filter(method => method in handlers)];
      if ("GET" in handlers && !("HEAD" in handlers)) methods.push("HEAD");
      expect(response.status).toBe(204);
      expect(response.headers.get("allow")).toBe(methods.sort().join(", "));
      expect(response.body).toBeNull();
    },
  );
});
