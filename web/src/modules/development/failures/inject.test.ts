import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const env = vi.hoisted(() => ({
  config: vi.fn((): object | null => ({ key: Buffer.alloc(32, 7) })),
  headers: new Headers({ "x-edra-public-path": "/demo/students?tab=1" }),
}));
vi.mock("../config", () => ({ CONTROL_COOKIE: "edra-dev-control", developmentConfig: env.config }));
vi.mock("next/headers", () => ({ headers: async () => env.headers }));

import { failureFetch, failureState, signature } from "./inject";
import { failureResponse, operationOf, readArm, type Arm } from "./shared";

const key = Buffer.alloc(32, 7);
const control = "c".repeat(43);
const url = "https://abcdefghijklmnopqrst.supabase.co";

function cookieFor(arm: Arm, token = control) {
  const payload = Buffer.from(JSON.stringify(arm)).toString("base64url");
  return `${payload}.${signature(key, payload, token)}`;
}

function store(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? { name, value: values[name] } : undefined) } as never;
}

const real = vi.fn(async () => new Response("[]", { status: 200 }));
vi.stubGlobal("fetch", real);

beforeEach(() => {
  real.mockClear();
  env.config.mockReturnValue({ key });
  env.headers = new Headers({ "x-edra-public-path": "/demo/students?tab=1" });
  failureState.triggered.clear();
  failureState.observed.clear();
});

describe("operationOf", () => {
  it("names tables, RPCs, storage buckets and functions, and ignores auth", () => {
    expect(operationOf(`${url}/rest/v1/students?select=*`)).toBe("GET students");
    expect(operationOf(`${url}/rest/v1/students`, "HEAD")).toBe("GET students");
    expect(operationOf(`${url}/rest/v1/rpc/create_session`, "post")).toBe("POST rpc/create_session");
    expect(operationOf(`${url}/storage/v1/object/sign/content-media/a/b.mp4`, "POST")).toBe("POST storage/content-media");
    expect(operationOf(`${url}/functions/v1/send-otp`, "POST")).toBe("POST functions/send-otp");
    expect(operationOf(`${url}/auth/v1/user`)).toBeNull();
    expect(operationOf("not a url")).toBeNull();
  });
});

describe("failureResponse", () => {
  it("throws like fetch for network failures and returns PostgREST errors otherwise", async () => {
    expect(() => failureResponse("network")).toThrow(TypeError);
    const response = failureResponse("permission");
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("42501");
  });
});

describe("readArm", () => {
  it("rejects malformed payloads", () => {
    expect(readArm(undefined)).toBeNull();
    expect(readArm("garbage.sig")).toBeNull();
    const bad = Buffer.from(JSON.stringify({ id: "x", operation: "DROP students", kind: "network", mode: "once" })).toString("base64url");
    expect(readArm(`${bad}.sig`)).toBeNull();
  });
});

describe("failureFetch", () => {
  const arm: Arm = { id: "a1", operation: "GET students", kind: "unavailable", mode: "once" };

  it("is off without a preview control cookie or Developer mode configuration", async () => {
    expect(await failureFetch(store({ "edra-dev-failure": cookieFor(arm) }))).toBeUndefined();
    env.config.mockReturnValue(null);
    expect(await failureFetch(store({ "edra-dev-control": control, "edra-dev-failure": cookieFor(arm) }))).toBeUndefined();
  });

  it("is off for router prefetches", async () => {
    env.headers = new Headers({ "next-router-prefetch": "1" });
    expect(await failureFetch(store({ "edra-dev-control": control, "edra-dev-failure": cookieFor(arm) }))).toBeUndefined();
  });

  it("fails a once-only arm exactly once without calling Supabase, then recovers", async () => {
    const simulated = (await failureFetch(store({ "edra-dev-control": control, "edra-dev-failure": cookieFor(arm) })))!;
    const results = await Promise.all([simulated(`${url}/rest/v1/students`), simulated(`${url}/rest/v1/students`)]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 503]);
    expect(real).toHaveBeenCalledTimes(1);
    expect((await simulated(`${url}/rest/v1/groups`)).status).toBe(200);
    expect([...failureState.observed.get("/demo/students")!]).toEqual(["GET students", "GET groups"]);
  });

  it("keeps failing a persistent arm", async () => {
    const simulated = (await failureFetch(store({ "edra-dev-control": control, "edra-dev-failure": cookieFor({ ...arm, mode: "persistent" }) })))!;
    for (let i = 0; i < 3; i += 1) expect((await simulated(`${url}/rest/v1/students`)).status).toBe(503);
    expect(real).not.toHaveBeenCalled();
  });

  it("ignores arms signed for another preview control or tampered with", async () => {
    const other = (await failureFetch(store({ "edra-dev-control": control, "edra-dev-failure": cookieFor(arm, "d".repeat(43)) })))!;
    expect((await other(`${url}/rest/v1/students`)).status).toBe(200);
    const [, sig] = cookieFor(arm).split(".");
    const forged = Buffer.from(JSON.stringify({ ...arm, mode: "persistent" })).toString("base64url");
    const tampered = (await failureFetch(store({ "edra-dev-control": control, "edra-dev-failure": `${forged}.${sig}` })))!;
    expect((await tampered(`${url}/rest/v1/students`)).status).toBe(200);
  });
});
