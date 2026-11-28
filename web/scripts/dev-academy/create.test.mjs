import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  clearPartsSql, loadDocument, loadSql, missingMigrations, probeDeliveryGuard, signHook, splitParts, stagePartSql,
} from "./create.mjs";

const secretBytes = Buffer.from("0123456789abcdef0123456789abcdef");
const secret = `v1,whsec_${secretBytes.toString("base64")}`;
const ACCOUNT = { userId: "11111111-2222-4333-8444-555555555555", phone: "+201000000000" };
const TARGET = { url: "https://fgbcjlibwgxylfwmocgx.supabase.co" };

describe("missingMigrations", () => {
  it("matches by name so renumbered versions count as applied", () => {
    assert.deepEqual(missingMigrations(["alpha"], ["20990101000000_alpha.sql"]), []);
  });

  it("reports migrations whose names are not applied and ignores non-migration files", () => {
    const files = ["20250101000000_alpha.sql", "20250202000000_beta.sql", "20250303000000_gamma.sql", "README.md"];
    assert.deepEqual(missingMigrations(["alpha", "beta"], files), ["gamma"]);
  });
});

describe("signHook", () => {
  it("signs id.timestamp.body with the decoded secret", () => {
    const headers = signHook(secret, "msg_1", 1700000000, "{}");
    const expected = createHmac("sha256", secretBytes).update("msg_1.1700000000.{}").digest("base64");
    assert.equal(headers["webhook-id"], "msg_1");
    assert.equal(headers["webhook-timestamp"], "1700000000");
    assert.equal(headers["webhook-signature"], `v1,${expected}`);
  });

  it("uses the first of several pipe-separated secrets", () => {
    const other = `v1,whsec_${Buffer.from("another-secret-value-not-used").toString("base64")}`;
    assert.deepEqual(signHook(`${secret}|${other}`, "msg_1", 1, "x"), signHook(secret, "msg_1", 1, "x"));
  });
});

describe("probeDeliveryGuard", () => {
  const fetcherReturning = (status, body) => async () => ({ status, json: async () => body });

  it("resolves when the deployed hook refuses the synthetic recipient", async () => {
    await probeDeliveryGuard(TARGET, secret, ACCOUNT, fetcherReturning(403, { error: { http_code: 403 } }));
  });

  it("rejects when the hook does not refuse", async () => {
    await assert.rejects(probeDeliveryGuard(TARGET, secret, ACCOUNT, fetcherReturning(200, {})), /did not refuse/);
  });

  it("rejects before calling the function when the hook secret is missing", async () => {
    let called = false;
    await assert.rejects(
      probeDeliveryGuard(TARGET, undefined, ACCOUNT, async () => {
        called = true;
      }),
      /SEND_SMS_HOOK_SECRET is required/,
    );
    assert.equal(called, false);
  });
});

describe("staged load", () => {
  const CTX = {
    runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", lockToken: "11111111-2222-4333-8444-555555555555",
    hash: "h".repeat(64), slug: "code", scenario: { academy: { name: "Coding School" }, note: "it's $$ quoted 😀 ".repeat(50) },
  };

  it("splits into bounded pieces that rejoin to the original text", () => {
    const text = loadDocument(CTX);
    const parts = splitParts(text, 7);
    assert.ok(parts.length > 1);
    assert.ok(parts.every((p) => p.length >= 1 && p.length <= 7));
    assert.equal(parts.join(""), text);
    assert.deepEqual(JSON.parse(parts.join("")).scenario, CTX.scenario);
  });

  it("never cuts a surrogate pair", () => {
    const text = "a😀b😀😀c";
    for (const size of [1, 2, 3, 4]) {
      const parts = splitParts(text, Math.max(size, 2));
      assert.equal(parts.join(""), text);
      for (const p of parts) assert.ok(!/[\ud800-\udbff]$/.test(p) && !/^[\udc00-\udfff]/.test(p), JSON.stringify(p));
    }
  });

  it("returns one piece for a document under the limit and none for empty text", () => {
    assert.deepEqual(splitParts("abc", 10), ["abc"]);
    assert.deepEqual(splitParts("", 10), []);
  });

  it("gates staging writes on the run's loading lock", () => {
    for (const sql of [clearPartsSql(CTX), stagePartSql(CTX, 3, "x")]) {
      assert.match(sql, /state = 'loading'/);
      assert.match(sql, new RegExp(`lock_token = '${CTX.lockToken}' and lock_expires_at > now\\(\\)`));
    }
    assert.match(stagePartSql(CTX, 3, "x"), /select 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 3, \$edra_[0-9a-f]{16}\$x\$edra_/);
  });

  it("loads in one transaction that checks the piece count and deletes the pieces before commit", () => {
    const sql = loadSql(CTX, 4);
    assert.match(sql, /^begin;/);
    assert.match(sql, /commit;$/);
    assert.match(sql, /count\(\*\) <> 4 or coalesce\(max\(seq\), -1\) <> 3/);
    assert.match(sql, /string_agg\(part, '' order by seq\)::jsonb as doc/);
    const load = sql.indexOf("Preflight: the caller holds");
    const cleanup = sql.lastIndexOf("delete from edra_private.dev_load_parts");
    assert.ok(load > 0 && cleanup > load && cleanup < sql.lastIndexOf("commit;"));
  });
});
