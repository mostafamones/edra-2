import assert from "node:assert/strict";

import { withEntrypoint } from "../_shared/testing/entrypoint.ts";

const environmentNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_TEMPLATE_LANGUAGE",
  "META_WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_DEVELOPMENT_MODE",
  "WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE",
];
const requiredNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
];

Deno.test("account-password request boundaries", async (t) => {
  await withEntrypoint(
    () => import("./index.ts"),
    environmentNames,
    async ({ handle, setEnv }) => {
      const request = (method: string, bearer = false) =>
        new Request("https://example.test/account-password", {
          method,
          headers: bearer ? { authorization: "Bearer synthetic-token" } : {},
        });
      const assertCors = (response: Response) => {
        assert.equal(response.headers.get("access-control-allow-origin"), "*");
        assert.equal(
          response.headers.get("access-control-allow-methods"),
          "POST, OPTIONS",
        );
        assert.equal(
          response.headers.get("access-control-allow-headers"),
          "authorization, x-client-info, apikey, content-type",
        );
        assert.equal(response.headers.get("content-type"), "application/json");
      };
      await t.step("OPTIONS returns preflight without fetch", async () => {
        const response = await handle(request("OPTIONS"));
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "");
        assertCors(response);
      });
      await t.step("unsupported method returns 405 without fetch", async () => {
        const response = await handle(request("GET"));
        assert.equal(response.status, 405);
        assert.deepEqual(await response.json(), {
          error: "method_not_allowed",
        });
        assertCors(response);
      });
      await t.step(
        "POST without bearer returns 401 without fetch",
        async () => {
          const response = await handle(request("POST"));
          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), {
            error: "not_authenticated",
          });
          assertCors(response);
        },
      );
      for (const missing of requiredNames) {
        await t.step(
          `missing ${missing} returns unavailable before auth/database fetch`,
          async () => {
            const settings = Object.fromEntries(
              requiredNames.map((name) => [
                name,
                name === "SUPABASE_URL"
                  ? "https://example.test"
                  : "dummy-test-key",
              ]),
            );
            delete settings[missing];
            setEnv(settings);
            const response = await handle(request("POST", true));
            assert.equal(response.status, 503);
            assert.deepEqual(await response.json(), { error: "unavailable" });
            assertCors(response);
          },
        );
      }
    },
  );
});
