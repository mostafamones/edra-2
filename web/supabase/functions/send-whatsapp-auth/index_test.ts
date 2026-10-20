import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";

import { withEntrypoint } from "../_shared/testing/entrypoint.ts";

const environmentNames = [
  "SEND_SMS_HOOK_SECRET",
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_TEMPLATE_LANGUAGE",
  "META_WHATSAPP_GRAPH_API_VERSION",
  "EDRA_AUTH_DEV_LOG_PHONE",
  "EDRA_AUTH_DEV_LOG_UNTIL",
  "WHATSAPP_DEVELOPMENT_MODE",
  "WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE",
];
const secret = `whsec_${btoa("synthetic-runtime-hook-secret-32!")}`;
const otp = "654321";
// Reserved fictional North American numbers; never delivered anywhere.
const phone = "+12025550101";
const developmentPhone = "+12025550102";
const settings = {
  SEND_SMS_HOOK_SECRET: `v1,${secret}`,
  META_WHATSAPP_ACCESS_TOKEN: "dummy-runtime-access-token",
  META_WHATSAPP_PHONE_NUMBER_ID: "dummy-sender/id",
  META_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
  META_WHATSAPP_GRAPH_API_VERSION: "v99.0",
};

function signedRequest(tamper = false) {
  const body = JSON.stringify({
    user: {
      phone: "+12025550103",
      user_metadata: { full_name: "Synthetic User" },
    },
    sms: { phone, otp },
  });
  const timestamp = new Date();
  const id = "synthetic-runtime-webhook";
  return new Request("https://example.test/send-whatsapp-auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign(id, timestamp, body),
    },
    body: tamper ? `${body} ` : body,
  });
}

Deno.test("send-whatsapp-auth environment wiring under Deno", async (t) => {
  await withEntrypoint(
    () => import("./index.ts"),
    environmentNames,
    async ({ handle, setEnv, expectFetch, logs, errors }) => {
      const expectDelivery = (version: string, development = false) => {
        expectFetch((input, init) => {
          assert.equal(
            input,
            `https://graph.facebook.com/${version}/dummy-sender%2Fid/messages`,
          );
          assert.equal(init?.method, "POST");
          const headers = new Headers(init?.headers);
          assert.equal(
            headers.get("authorization"),
            `Bearer ${settings.META_WHATSAPP_ACCESS_TOKEN}`,
          );
          assert.equal(headers.get("content-type"), "application/json");
          assert.ok(init?.signal instanceof AbortSignal);
          assert.equal(init.signal.aborted, false);
          const message = JSON.parse(String(init.body));
          assert.equal(message.messaging_product, "whatsapp");
          assert.equal(message.type, "template");
          assert.equal(
            message.to,
            (development ? developmentPhone : phone).slice(1),
          );
          assert.equal(
            message.template.name,
            development ? "jaspers_market_order_confirmation_v1" : "verify",
          );
          assert.deepEqual(message.template.language, {
            code: development ? "en_US" : "ar",
          });
          assert.ok(JSON.stringify(message.template.components).includes(otp));
          return Response.json({
            messages: [{ id: "synthetic-provider-success" }],
          });
        });
      };
      const assertSuccess = async (response: Response) => {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {});
      };
      const assertError = async (
        response: Response,
        status: number,
        code: number,
        message: string,
      ) => {
        assert.equal(response.status, status);
        const text = await response.text();
        for (
          const sensitive of [
            otp,
            secret,
            settings.META_WHATSAPP_ACCESS_TOKEN,
            settings.META_WHATSAPP_PHONE_NUMBER_ID,
          ]
        ) {
          assert.equal(
            text.includes(sensitive),
            false,
            "Error response exposed synthetic sensitive data",
          );
        }
        assert.deepEqual(JSON.parse(text), {
          error: { http_code: code, message },
        });
      };
      await t.step(
        "production configuration reaches provider stub using sms.phone",
        async () => {
          setEnv(settings);
          expectDelivery("v99.0");
          await assertSuccess(await handle(signedRequest()));
          assert.deepEqual(logs, []);
        },
      );
      await t.step(
        "absent Graph version uses current source default",
        async () => {
          const defaults: Record<string, string> = { ...settings };
          delete defaults.META_WHATSAPP_GRAPH_API_VERSION;
          setEnv(defaults);
          expectDelivery("v23.0");
          await assertSuccess(await handle(signedRequest()));
          assert.deepEqual(logs, []);
        },
      );
      for (const kind of ["tampered body", "invalid signature"]) {
        await t.step(
          `${kind} fails before fetch or development OTP log`,
          async () => {
            setEnv({
              ...settings,
              WHATSAPP_DEVELOPMENT_MODE: "true",
              WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE: developmentPhone,
            });
            const request = signedRequest(kind === "tampered body");
            if (kind === "invalid signature") {
              request.headers.set("webhook-signature", "v1,invalid");
            }
            await assertError(
              await handle(request),
              401,
              401,
              "Invalid hook signature.",
            );
            assert.deepEqual(logs, []);
            assert.equal(JSON.stringify(errors).includes(otp), false);
          },
        );
      }
      await t.step(
        "missing hook secret returns HTTP 500 without fetch",
        async () => {
          const missing: Record<string, string> = { ...settings };
          delete missing.SEND_SMS_HOOK_SECRET;
          setEnv(missing);
          await assertError(
            await handle(signedRequest()),
            500,
            500,
            "WhatsApp authentication delivery is not configured.",
          );
        },
      );
      for (
        const name of [
          "META_WHATSAPP_ACCESS_TOKEN",
          "META_WHATSAPP_PHONE_NUMBER_ID",
          "META_WHATSAPP_TEMPLATE_LANGUAGE",
        ] as const
      ) {
        await t.step(
          `missing ${name} retains HTTP 200 / hook 500 contract`,
          async () => {
            const missing: Record<string, string> = { ...settings };
            delete missing[name];
            setEnv(missing);
            await assertError(
              await handle(signedRequest()),
              200,
              500,
              "WhatsApp authentication delivery is not configured.",
            );
          },
        );
      }
      await t.step(
        "normalized development mode selects development recipient/template and captures OTP log",
        async () => {
          setEnv({
            ...settings,
            WHATSAPP_DEVELOPMENT_MODE: " \tTrUe\n",
            WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE: ` ${developmentPhone} `,
          });
          expectDelivery("v99.0", true);
          await assertSuccess(await handle(signedRequest()));
          assert.deepEqual(logs, [["EDRA_DEV_AUTH_CODE", {
            phoneLast4: phone.slice(-4),
            code: otp,
          }]]);
          logs.length = 0;
        },
      );
      await t.step(
        "disabled development mode uses requested recipient and production template without OTP logs",
        async () => {
          setEnv({
            ...settings,
            WHATSAPP_DEVELOPMENT_MODE: " false ",
            WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE: developmentPhone,
          });
          expectDelivery("v99.0");
          await assertSuccess(await handle(signedRequest()));
          assert.deepEqual(logs, []);
        },
      );
      for (const recipient of [undefined, "invalid-recipient"]) {
        await t.step(
          `${
            recipient === undefined ? "missing" : "invalid"
          } development recipient fails closed`,
          async () => {
            setEnv({
              ...settings,
              WHATSAPP_DEVELOPMENT_MODE: "true",
              ...(recipient === undefined
                ? {}
                : { WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE: recipient }),
            });
            await assertError(
              await handle(signedRequest()),
              200,
              500,
              "WhatsApp development recipient is not configured.",
            );
            assert.deepEqual(logs, []);
          },
        );
      }
      assert.equal(JSON.stringify(errors).includes(otp), false);
    },
  );
});
