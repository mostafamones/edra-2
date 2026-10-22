import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSqlRunner, jsonLiteral, managementToken, resolveTarget, sqlLiteral } from "./connection.mjs";

const DEV = "fgbcjlibwgxylfwmocgx";
const OTHER = "abcdefghijklmnopqrst";

/** Fake fetch that records the call and answers with the given status and body text. */
function fakeFetcher(status, body) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
  return { fetcher, calls };
}

describe("resolveTarget", () => {
  it("accepts the development ref with a matching URL", () => {
    for (const [ref, kind] of [[DEV, "development"]]) {
      const env = { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "svc" };
      assert.deepEqual(resolveTarget(ref, env), { projectRef: ref, kind, url: `https://${ref}.supabase.co`, serviceKey: "svc" });
    }
  });

  it("accepts a URL with a trailing slash", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co/`, SUPABASE_SERVICE_ROLE_KEY: "svc" };
    assert.equal(resolveTarget(DEV, env).projectRef, DEV);
  });

  it("rejects unknown and production-like refs", () => {
    const message = "Unknown or disallowed project reference.";
    assert.throws(() => resolveTarget("abcdefghijklmnopqrst", {}), { message });
    assert.throws(() => resolveTarget("abcdefghijklmnopqrstu", {}), { message });
    assert.throws(() => resolveTarget("FGBCJLIBWGXYLFWMOCGX", {}), { message });
  });

  it("rejects a mismatched URL", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "svc" };
    assert.throws(() => resolveTarget(DEV, env), { message: "NEXT_PUBLIC_SUPABASE_URL does not match the selected project." });
  });

  it("requires a service role key", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` };
    assert.throws(() => resolveTarget(DEV, env), { message: "SUPABASE_SERVICE_ROLE_KEY is required for cloud commands." });
  });
});

describe("managementToken", () => {
  it("prefers the environment over the login file", () => {
    const readFile = () => {
      throw new Error("should not read");
    };
    assert.equal(managementToken({ SUPABASE_ACCESS_TOKEN: "  env-token \n" }, readFile), "env-token");
  });

  it("falls back to the injected login file", () => {
    const readFile = (path, encoding) => {
      assert.match(path, /\.supabase\/access-token$/);
      assert.equal(encoding, "utf8");
      return "file-token\n";
    };
    assert.equal(managementToken({}, readFile), "file-token");
  });

  it("throws when neither source has a token", () => {
    const message = "A Supabase access token is required for SQL (SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token).";
    assert.throws(() => managementToken({ SUPABASE_ACCESS_TOKEN: "   " }, () => ""), { message });
    assert.throws(
      () =>
        managementToken({}, () => {
          throw new Error("ENOENT");
        }),
      { message },
    );
  });
});

describe("createSqlRunner", () => {
  it("posts the query with a bearer token to the project endpoint and returns rows", async () => {
    const { fetcher, calls } = fakeFetcher(200, JSON.stringify([{ n: 1 }]));
    const runSql = createSqlRunner(DEV, { token: "tok-123", fetcher });
    assert.deepEqual(await runSql("select 1"), [{ n: 1 }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://api.supabase.com/v1/projects/${DEV}/database/query`);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.authorization, "Bearer tok-123");
    assert.equal(calls[0].init.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0].init.body), { query: "select 1" });
    assert.ok(calls[0].init.signal);
  });

  it("redacts the token and truncates the message on HTTP errors", async () => {
    const longMessage = `bad token tok-123 ${"x".repeat(3000)}`;
    const { fetcher } = fakeFetcher(401, JSON.stringify({ message: longMessage }));
    const runSql = createSqlRunner(DEV, { token: "tok-123", fetcher });
    await assert.rejects(runSql("select 1"), (error) => {
      assert.match(error.message, /^SQL failed \(HTTP 401\): bad token \[redacted\] x+$/);
      assert.ok(!error.message.includes("tok-123"));
      assert.ok(error.message.length <= "SQL failed (HTTP 401): ".length + 1500);
      return true;
    });
  });

  it("shows non-JSON error bodies as text", async () => {
    const { fetcher } = fakeFetcher(500, "upstream down");
    const runSql = createSqlRunner(DEV, { token: "tok-123", fetcher });
    await assert.rejects(runSql("select 1"), { message: "SQL failed (HTTP 500): upstream down" });
  });
});

describe("sqlLiteral and jsonLiteral", () => {
  it("round-trips a string containing quotes and the $edra_ prefix", () => {
    const value = "it's \"quoted\" $edra_0123456789abcdef$ and $$ text";
    const literal = sqlLiteral(value);
    const match = /^(\$edra_[0-9a-f]{16}\$)([\s\S]*)\1$/.exec(literal);
    assert.ok(match, "literal is dollar-quoted with a random tag");
    assert.equal(match[2], value);
  });

  it("wraps JSON as a jsonb cast", () => {
    const literal = jsonLiteral({ a: "b:c" });
    assert.match(literal, /::jsonb$/);
    const match = /^(\$edra_[0-9a-f]{16}\$)([\s\S]*)\1::jsonb$/.exec(literal);
    assert.deepEqual(JSON.parse(match[2]), { a: "b:c" });
  });
});
