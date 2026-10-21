import { Webhook } from "standardwebhooks";

export const WHATSAPP_AUTH_TEMPLATE = "verify";
export const WHATSAPP_DEVELOPMENT_TEMPLATE = "jaspers_market_order_confirmation_v1";
const WHATSAPP_DEVELOPMENT_TEMPLATE_LANGUAGE = "en_US";
const WHATSAPP_DEVELOPMENT_ESTIMATED_DELIVERY = "Tomorrow at 12:34";

export type WhatsAppHookConfig = {
  hookSecret: string;
  accessToken: string;
  phoneNumberId: string;
  templateLanguage: string;
  graphApiVersion?: string;
  requestTimeoutMs?: number;
  devLogPhone?: string;
  devLogUntil?: string;
  whatsappDevelopmentMode?: boolean;
  whatsappDevelopmentRecipientPhone?: string;
  deliveryBlocked?: (target: { userId: string | null; phone: string }) => Promise<boolean>;
};

type SendSmsHookPayload = {
  user?: { id?: unknown; phone?: unknown; user_metadata?: { full_name?: unknown } };
  sms?: { otp?: unknown; phone?: unknown };
};

type Fetcher = typeof fetch;

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hookError(status: number, message: string, responseStatus = status) {
  return json({ error: { http_code: status, message } }, responseStatus);
}

function normalizeHookSecret(secret: string) {
  return secret.startsWith("v1,") ? secret.slice(3) : secret;
}

function verifyHookPayload(rawBody: string, headers: Record<string, string>, secrets: string) {
  for (const secret of secrets.split("|").map((value) => value.trim()).filter(Boolean)) {
    try {
      return new Webhook(normalizeHookSecret(secret)).verify(rawBody, headers);
    } catch {
      // Continue so hook secrets can be rotated without interrupting delivery.
    }
  }
  throw new Error("No hook secret matched.");
}

export function buildWhatsAppTemplateMessage(phone: string, otp: string, language: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: WHATSAPP_AUTH_TEMPLATE,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: otp }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };
}

export function buildWhatsAppDevelopmentMessage(phone: string, name: string, otp: string, verifiedPhone: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: WHATSAPP_DEVELOPMENT_TEMPLATE,
      language: { code: WHATSAPP_DEVELOPMENT_TEMPLATE_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: name },
            { type: "text", text: otp },
            { type: "text", text: `${WHATSAPP_DEVELOPMENT_ESTIMATED_DELIVERY} ${verifiedPhone.slice(-4)}` },
          ],
        },
      ],
    },
  };
}

function parseHookPayload(value: unknown) {
  const payload = value as SendSmsHookPayload;
  // Supabase sends the actual recipient here; user.phone may be empty or the old number.
  const phone = payload?.sms?.phone ?? payload?.user?.phone;
  const otp = payload?.sms?.otp;
  if (typeof phone !== "string" || !PHONE_PATTERN.test(phone)) return null;
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) return null;
  const fullName = payload?.user?.user_metadata?.full_name;
  const name = typeof fullName === "string" ? fullName.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  const userId = typeof payload?.user?.id === "string" ? payload.user.id : null;
  return { phone, otp, name: name || "there", userId };
}

async function requestMeta(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverWithRetry(
  message: ReturnType<typeof buildWhatsAppTemplateMessage> | ReturnType<typeof buildWhatsAppDevelopmentMessage>,
  config: Pick<WhatsAppHookConfig, "accessToken" | "phoneNumberId" | "graphApiVersion" | "requestTimeoutMs">,
  fetcher: Fetcher,
) {
  const version = config.graphApiVersion ?? "v23.0";
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  };

  let lastResponse: Response | null = null;
  let timedOut = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await requestMeta(url, init, fetcher, config.requestTimeoutMs ?? 1800);
      lastResponse = response;
      if (response.ok) return { ok: true as const };
      if (response.status < 500) {
        let metaCode: number | null = null;
        let metaSubcode: number | null = null;
        let metaType: string | null = null;
        let fbTraceId: string | null = null;
        try {
          const body = await response.json();
          if (typeof body?.error?.code === "number") metaCode = body.error.code;
          if (typeof body?.error?.error_subcode === "number") metaSubcode = body.error.error_subcode;
          if (typeof body?.error?.type === "string") metaType = body.error.type;
          if (typeof body?.error?.fbtrace_id === "string") fbTraceId = body.error.fbtrace_id;
        } catch {
          // The HTTP status still identifies the failing provider request.
        }
        return { ok: false as const, timedOut: false, status: response.status, metaCode, metaSubcode, metaType, fbTraceId };
      }
    } catch (error) {
      timedOut = error instanceof DOMException && error.name === "AbortError";
    }
  }
  return { ok: false as const, timedOut: timedOut && lastResponse === null, status: lastResponse?.status };
}

export async function handleWhatsAppAuthHook(
  request: Request,
  config: Partial<WhatsAppHookConfig>,
  fetcher: Fetcher = fetch,
) {
  if (request.method !== "POST") return hookError(405, "Method not allowed.");

  if (!config.hookSecret) return hookError(500, "WhatsApp authentication delivery is not configured.");

  const rawBody = await request.text();
  let verifiedPayload: unknown;
  try {
    verifiedPayload = verifyHookPayload(rawBody, Object.fromEntries(request.headers.entries()), config.hookSecret);
  } catch {
    console.error("WhatsApp authentication hook signature verification failed");
    return hookError(401, "Invalid hook signature.");
  }

  const payload = parseHookPayload(verifiedPayload);
  if (!payload) {
    console.error("WhatsApp authentication hook payload validation failed");
    return hookError(400, "Invalid Send SMS Hook payload.", 200);
  }

  // Synthetic development contacts never receive or log a code, including through development routing.
  if (!config.deliveryBlocked) return hookError(500, "WhatsApp authentication delivery is not configured.", 200);
  let blocked: boolean;
  try {
    blocked = await config.deliveryBlocked({ userId: payload.userId, phone: payload.phone });
  } catch {
    console.error("WhatsApp authentication delivery registry check failed");
    return hookError(503, "Authentication codes are temporarily unavailable.", 200);
  }
  if (blocked) return hookError(403, "This test account cannot receive authentication codes.", 200);

  const developmentMode = config.whatsappDevelopmentMode === true;
  const developmentRecipient = config.whatsappDevelopmentRecipientPhone?.trim();
  if (developmentMode && (!developmentRecipient || !PHONE_PATTERN.test(developmentRecipient))) {
    console.error("WhatsApp development routing is enabled without a valid recipient phone.");
    return hookError(500, "WhatsApp development recipient is not configured.", 200);
  }

  const devLogUntil = config.devLogUntil ? Date.parse(config.devLogUntil) : NaN;
  const isTemporaryDevLogTarget =
    config.devLogPhone &&
    payload.phone.replace(/^\+/, "") === config.devLogPhone.replace(/^\+/, "") &&
    Number.isFinite(devLogUntil) &&
    Date.now() < devLogUntil;
  if (developmentMode) {
    // This development-only route deliberately logs all signed OTP requests so
    // fake test accounts can be verified manually from the Edge Function Logs.
    console.log("EDRA_DEV_AUTH_CODE", {
      phoneLast4: payload.phone.slice(-4),
      code: payload.otp,
    });
  } else if (isTemporaryDevLogTarget) {
    // Only a signed Supabase hook can reach this branch. The allowlist and expiry
    // are server-only secrets; the code never enters the HTTP response.
    console.log("EDRA_DEV_AUTH_CODE", {
      phoneLast4: payload.phone.slice(-4),
      code: payload.otp,
    });
    return json({}, 200);
  }

  if (!config.accessToken || !config.phoneNumberId || (!developmentMode && !config.templateLanguage)) {
    return hookError(500, "WhatsApp authentication delivery is not configured.", 200);
  }

  const deliveryPhone = developmentMode ? developmentRecipient! : payload.phone;
  const message = developmentMode
    ? buildWhatsAppDevelopmentMessage(deliveryPhone, payload.name, payload.otp, payload.phone)
    : buildWhatsAppTemplateMessage(deliveryPhone, payload.otp, config.templateLanguage!);
  const delivery = await deliverWithRetry(message, config as WhatsAppHookConfig, fetcher);
  if (!delivery.ok) {
    console.error("WhatsApp authentication delivery failed", {
      timedOut: delivery.timedOut,
      metaStatus: delivery.status ?? null,
      metaCode: "metaCode" in delivery ? delivery.metaCode : null,
      metaSubcode: "metaSubcode" in delivery ? delivery.metaSubcode : null,
      metaType: "metaType" in delivery ? delivery.metaType : null,
      fbTraceId: "fbTraceId" in delivery ? delivery.fbTraceId : null,
      developmentMode,
    });
    const metaCode = "metaCode" in delivery && typeof delivery.metaCode === "number"
      ? ` (Meta code ${delivery.metaCode})`
      : "";
    return hookError(
      delivery.timedOut ? 504 : 502,
      delivery.timedOut ? "WhatsApp delivery timed out." : `WhatsApp rejected the authentication message.${metaCode}`,
      200,
    );
  }

  return json({}, 200);
}
