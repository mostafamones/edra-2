import { Webhook } from "standardwebhooks";
import { describe, expect, it, vi } from "vitest";

import { buildWhatsAppTemplateMessage, handleWhatsAppAuthHook } from "./whatsapp-auth";

const rawSecret = Buffer.from("edra-hook-test-secret-32-bytes!!").toString("base64");
const hookSecret = `v1,whsec_${rawSecret}`;
const config = {
  hookSecret,
  accessToken: "meta-token",
  phoneNumberId: "123456789",
  templateLanguage: "en_US",
  graphApiVersion: "v23.0",
};

function signedRequest(payload: {
  user: { phone?: string };
  sms: { otp: string; phone?: string };
} = { user: { phone: "+201001234567" }, sms: { otp: "123456" } }) {
  const body = JSON.stringify(payload);
  const webhook = new Webhook(`whsec_${rawSecret}`);
  const id = "msg_test_1";
  const timestamp = new Date();
  return new Request("https://example.test/functions/v1/send-whatsapp-auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": webhook.sign(id, timestamp, body),
    },
    body,
  });
}

describe("WhatsApp authentication hook", () => {
  it("builds the approved authentication template payload", () => {
    expect(buildWhatsAppTemplateMessage("+201001234567", "123456", "ar")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "201001234567",
      type: "template",
      template: {
        name: "verify",
        language: { code: "ar" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "123456" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
        ],
      },
    });
  });

  it("rejects an invalid Supabase signature before calling Meta", async () => {
    const request = signedRequest();
    request.headers.set("webhook-signature", "v1,invalid");
    const fetcher = vi.fn();
    const response = await handleWhatsAppAuthHook(request, config, fetcher);
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("logs a signed OTP only for the temporary development number", async () => {
    const logger = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetcher = vi.fn();
    try {
      const response = await handleWhatsAppAuthHook(
        signedRequest({ user: {}, sms: { otp: "123456", phone: "201025126690" } }),
        {
          hookSecret,
          devLogPhone: "+201025126690",
          devLogUntil: new Date(Date.now() + 60_000).toISOString(),
        },
        fetcher,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({});
      expect(logger).toHaveBeenCalledWith("EDRA_DEV_AUTH_CODE", {
        phoneLast4: "6690",
        code: "123456",
      });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });

  it("rejects an unsigned request before the development OTP can be logged", async () => {
    const logger = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const request = signedRequest();
      request.headers.set("webhook-signature", "v1,invalid");
      const response = await handleWhatsAppAuthHook(request, {
        ...config,
        devLogPhone: "201001234567",
        devLogUntil: new Date(Date.now() + 60_000).toISOString(),
      }, vi.fn());
      expect(response.status).toBe(401);
      expect(logger).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });

  it("uses Meta for other numbers and after the development expiry", async () => {
    const logger = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      const devConfig = {
        ...config,
        devLogPhone: "201025126690",
        devLogUntil: new Date(Date.now() + 60_000).toISOString(),
      };
      await handleWhatsAppAuthHook(signedRequest(), devConfig, fetcher);
      await handleWhatsAppAuthHook(
        signedRequest({ user: {}, sms: { otp: "123456", phone: "201025126690" } }),
        { ...devConfig, devLogUntil: new Date(Date.now() - 60_000).toISOString() },
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(logger).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });

  it("delivers a signed OTP through Meta", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await handleWhatsAppAuthHook(signedRequest(), config, fetcher);
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/123456789/messages");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      to: "201001234567",
      template: { name: "verify", language: { code: "en_US" } },
    });
  });

  it("uses the SMS delivery phone when the user phone is empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await handleWhatsAppAuthHook(signedRequest({
      user: { phone: "" },
      sms: { otp: "123456", phone: "201025126690" },
    }), config, fetcher);
    expect(response.status).toBe(200);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).to).toBe("201025126690");
  });

  it("does not send a phone-change OTP to the user's old number", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await handleWhatsAppAuthHook(signedRequest({
      user: { phone: "+201001234567" },
      sms: { otp: "123456", phone: "201025126690" },
    }), config, fetcher);
    expect(response.status).toBe(200);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).to).toBe("201025126690");
  });

  it("rejects a malformed SMS delivery phone without sending to the user phone", async () => {
    const fetcher = vi.fn();
    const response = await handleWhatsAppAuthHook(signedRequest({
      user: { phone: "201001234567" },
      sms: { otp: "123456", phone: "01025126690" },
    }), config, fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      error: { http_code: 400, message: "Invalid Send SMS Hook payload." },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates a Meta error code through Supabase's JSON hook error contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 132001, message: "provider details stay hidden" },
    }), { status: 400 }));
    const response = await handleWhatsAppAuthHook(signedRequest(), config, fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      error: { http_code: 502, message: "WhatsApp rejected the authentication message. (Meta code 132001)" },
    });
  });

  it("retries a Meta server error and propagates a safe delivery error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("sensitive provider response", { status: 503 }));
    const response = await handleWhatsAppAuthHook(signedRequest(), config, fetcher);
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual({
      error: { http_code: 502, message: "WhatsApp rejected the authentication message." },
    });
  });

  it("fails clearly when required secrets are missing", async () => {
    const response = await handleWhatsAppAuthHook(signedRequest(), { ...config, accessToken: "" }, vi.fn());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      error: { http_code: 500, message: "WhatsApp authentication delivery is not configured." },
    });
  });

  it("aborts slow Meta requests and reports a timeout", async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const response = await handleWhatsAppAuthHook(signedRequest(), { ...config, requestTimeoutMs: 5 }, fetcher as typeof fetch);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      error: { http_code: 504, message: "WhatsApp delivery timed out." },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
