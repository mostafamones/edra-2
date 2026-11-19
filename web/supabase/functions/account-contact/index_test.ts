import assert from "node:assert/strict";

import { withEntrypoint } from "../_shared/testing/entrypoint.ts";

const environmentNames = [
  "ALLOWED_ORIGINS",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_TEMPLATE_LANGUAGE",
  "META_WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_DEVELOPMENT_MODE",
  "WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE",
];
const requiredNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

Deno.test("account-contact request boundaries", async (t) => {
  await withEntrypoint(
    () => {
      Deno.env.set(
        "ALLOWED_ORIGINS",
        " https://app.example.test, http://localhost:3000,*,null,https://bad.example.test/path,https://user:pass@bad.example.test ",
      );
      return import("./index.ts");
    },
    environmentNames,
    async ({ handle, setEnv }) => {
      const request = (
        method: string,
        bearer = false,
        origin: string | null = "https://app.example.test",
      ) =>
        new Request("https://example.test/account-contact", {
          method,
          headers: {
            ...(bearer ? { authorization: "Bearer synthetic-token" } : {}),
            ...(origin === null ? {} : { origin }),
          },
        });
      const assertCors = (response: Response) => {
        assert.equal(response.headers.get("vary"), "Origin");
        assert.equal(
          response.headers.get("access-control-allow-credentials"),
          null,
        );
        assert.equal(
          response.headers.get("access-control-allow-origin"),
          "https://app.example.test",
        );
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
      await t.step(
        "second configured origin receives its own preflight header",
        async () => {
          const response = await handle(
            request("OPTIONS", false, "http://localhost:3000"),
          );
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get("access-control-allow-origin"),
            "http://localhost:3000",
          );
          assert.equal(
            response.headers.get("access-control-allow-credentials"),
            null,
          );
          assert.equal(response.headers.get("vary"), "Origin");
        },
      );
      for (
        const origin of [
          "https://evil.example.test",
          "https://app.example.test.evil.test",
          "http://app.example.test",
          "https://app.example.test:444",
          "null",
          "*",
          "https://bad.example.test",
        ]
      ) {
        for (const method of ["OPTIONS", "POST"]) {
          await t.step(`${method} rejects ${origin} before fetch`, async () => {
            const response = await handle(request(method, true, origin));
            assert.equal(response.status, 403);
            assert.deepEqual(await response.json(), {
              error: "origin_not_allowed",
            });
            assert.equal(
              response.headers.get("access-control-allow-origin"),
              null,
            );
            assert.equal(
              response.headers.get("access-control-allow-credentials"),
              null,
            );
            assert.equal(response.headers.get("vary"), "Origin");
          });
        }
      }
      await t.step(
        "no Origin still requires bearer authentication",
        async () => {
          const response = await handle(request("POST", false, null));
          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), {
            error: "not_authenticated",
          });
          assert.equal(
            response.headers.get("access-control-allow-origin"),
            null,
          );
          assert.equal(
            response.headers.get("access-control-allow-credentials"),
            null,
          );
          assert.equal(response.headers.get("vary"), "Origin");
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

Deno.test("missing ALLOWED_ORIGINS blocks browser requests", async () => {
  await withEntrypoint(
    () => import("./index.ts?missing-origins"),
    environmentNames,
    async ({ handle }) => {
      for (const method of ["OPTIONS", "POST"]) {
        const response = await handle(
          new Request("https://example.test", {
            method,
            headers: {
              origin: "https://app.example.test",
              authorization: "Bearer synthetic-token",
            },
          }),
        );
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        assert.equal(
          response.headers.get("access-control-allow-credentials"),
          null,
        );
        assert.equal(response.headers.get("vary"), "Origin");
      }
    },
  );
});
