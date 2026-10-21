import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const api = vi.hoisted(() => ({
  config: vi.fn((): object | null => ({})),
  enterPreview: vi.fn(),
  switchPreview: vi.fn(),
  returnToStaff: vi.fn(),
  exitPreview: vi.fn(),
  previewStatus: vi.fn(),
}));
vi.mock("./config", () => ({ developmentConfig: api.config }));
vi.mock("./service", () => ({
  enterPreview: api.enterPreview,
  switchPreview: api.switchPreview,
  returnToStaff: api.returnToStaff,
  exitPreview: api.exitPreview,
  previewStatus: api.previewStatus,
}));

import { previewPost, previewStatusGet, type PreviewAction } from "./http";

const runId = "12345678-1234-4123-8123-123456789012";
const commandId = "3f2b9c1e-5d4a-4b8e-9c2f-1a2b3c4d5e6f";
const logicalId = "account:student:ali-1";
const staffOrigin = "http://app.lvh.me:3000";

const bodies: Record<PreviewAction, Record<string, unknown>> = {
  enter: { runId, studentLogicalId: null, returnTo: null },
  switch: { runId, logicalId, expectedRevision: 3, commandId, returnTo: null },
  return: { runId, expectedRevision: 3, commandId },
  exit: { runId: null },
};

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://app.lvh.me:3000/api/development/preview", {
  method: "POST",
  headers: { Origin: staffOrigin, "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const serviceFor: Record<PreviewAction, () => unknown> = {
  enter: () => api.enterPreview,
  switch: () => api.switchPreview,
  return: () => api.returnToStaff,
  exit: () => api.exitPreview,
};
const services = [api.enterPreview, api.switchPreview, api.returnToStaff, api.exitPreview];

beforeEach(() => {
  api.config.mockReturnValue({});
  for (const fn of [...services, api.previewStatus]) fn.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("previewPost gating", () => {
  it("returns 404 unavailable and calls no service when developer mode is off", async () => {
    api.config.mockReturnValueOnce(null);
    const response = await previewPost(post(bodies.enter), "enter");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
    for (const fn of services) expect(fn).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, string>]>([
    ["a missing Origin", { Origin: "" }],
    ["a foreign Origin", { Origin: "https://evil.example.com" }],
    ["a cross-site fetch", { "Sec-Fetch-Site": "cross-site" }],
    ["an Authorization header", { Authorization: "Bearer forbidden" }],
  ])("returns 403 forbidden for %s", async (_name, headers) => {
    const response = await previewPost(post(bodies.enter, headers), "enter");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
    expect(api.enterPreview).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-JSON content type", async () => {
    expect((await previewPost(post(bodies.enter, { "Content-Type": "text/plain" }), "enter")).status).toBe(403);
    expect(api.enterPreview).not.toHaveBeenCalled();
  });

  it("returns 403 for a body over 4096 characters", async () => {
    const response = await previewPost(post({ ...bodies.enter, returnTo: "x".repeat(4100) }), "enter");
    expect(response.status).toBe(403);
    expect(api.enterPreview).not.toHaveBeenCalled();
  });

  it("returns 403 for malformed JSON", async () => {
    expect((await previewPost(post("{not json"), "enter")).status).toBe(403);
    expect(api.enterPreview).not.toHaveBeenCalled();
  });

  it.each(["http://app.lvh.me:3000", "http://learn.lvh.me:3000"])("accepts the canonical origin %s", async (origin) => {
    api.enterPreview.mockResolvedValue({ ok: true, destination: "/x" });
    expect((await previewPost(post(bodies.enter, { Origin: origin }), "enter")).status).toBe(200);
  });
});

describe("previewPost body validation", () => {
  it.each<[PreviewAction, Record<string, unknown>]>([
    ["enter", { ...bodies.enter, extra: true }],
    ["enter", { ...bodies.enter, runId: "not-a-uuid" }],
    ["enter", { ...bodies.enter, studentLogicalId: "account:student:Ali" }],
    ["switch", { ...bodies.switch, logicalId: "student:ali" }],
    ["switch", { ...bodies.switch, expectedRevision: -1 }],
    ["switch", { ...bodies.switch, commandId: "not-a-uuid" }],
    ["return", { runId, expectedRevision: 3 }],
  ])("returns 400 invalid_request for %s with %j", async (action, body) => {
    const response = await previewPost(post(body), action);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_request" });
    expect(serviceFor[action]()).not.toHaveBeenCalled();
  });
});

describe("previewPost service calls", () => {
  it("passes parsed data to the enter service", async () => {
    api.enterPreview.mockResolvedValue({ ok: true, destination: "/edra-dev-abc/students" });
    const response = await previewPost(post({ ...bodies.enter, studentLogicalId: logicalId }), "enter");
    expect(api.enterPreview).toHaveBeenCalledWith({ runId, studentLogicalId: logicalId, returnTo: null });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("passes parsed data to the switch service", async () => {
    api.switchPreview.mockResolvedValue({ ok: true, destination: "/", revision: 4 });
    await previewPost(post(bodies.switch), "switch");
    expect(api.switchPreview).toHaveBeenCalledWith({ runId, logicalId, expectedRevision: 3, commandId, returnTo: null });
  });

  it("passes parsed data to the return service", async () => {
    api.returnToStaff.mockResolvedValue({ ok: true, destination: "/" });
    await previewPost(post(bodies.return), "return");
    expect(api.returnToStaff).toHaveBeenCalledWith({ runId, expectedRevision: 3, commandId });
  });

  it("passes the exit service no body data", async () => {
    api.exitPreview.mockResolvedValue({ ok: true, destination: "/" });
    const response = await previewPost(post(bodies.exit), "exit");
    expect(api.exitPreview).toHaveBeenCalledWith();
    expect(response.status).toBe(200);
  });

  it.each([
    ["conflict", 409],
    ["inactive", 410],
    ["sign_in_failed", 502],
    ["original_unavailable", 401],
  ])("maps the %s result to %i", async (error, status) => {
    api.enterPreview.mockResolvedValue({ ok: false, error });
    const response = await previewPost(post(bodies.enter), "enter");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 404 unavailable and logs only the action when a service throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    api.enterPreview.mockRejectedValue(new Error("secret token leaked"));
    const response = await previewPost(post(bodies.enter), "enter");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
    expect(spy).toHaveBeenCalledWith("Developer mode request failed", { action: "enter" });
    expect(spy.mock.calls[0]).toHaveLength(2);
  });
});

describe("previewStatusGet", () => {
  it("returns the status JSON with no-store caching", async () => {
    api.previewStatus.mockResolvedValue({ available: false });
    const response = await previewStatusGet();
    expect(await response.json()).toEqual({ available: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
