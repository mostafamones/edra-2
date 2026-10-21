import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { missingMigrations, probeDeliveryGuard, signHook } from "./create.mjs";

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
