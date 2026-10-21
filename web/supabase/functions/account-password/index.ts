import { createClient } from "@supabase/supabase-js";

import { deliveryBlocked } from "../_shared/synthetic-recipient.ts";
import {
  buildWhatsAppDevelopmentMessage,
  buildWhatsAppTemplateMessage,
  deliverWithRetry,
} from "../_shared/whatsapp-auth.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};

const CODE_PATTERN = /^\d{6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_CODE_METHODS = new Set(["otp", "recovery", "magiclink"]);
// The web new-password policy (src/modules/auth/validation.ts); 72 bytes is Auth's bcrypt limit.
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

/** Claims of a token already verified by Auth. */
function claimsOf(token: string): { session_id?: unknown; amr?: unknown } | null {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function e164(value: string) {
  return value.startsWith("+") ? value : `+${value}`;
}

function randomCode() {
  const values = new Uint32Array(1);
  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % 1000000).padStart(6, "0");
}

async function hashCode(secret: string, userId: string, challengeId: string, code: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`edra-account-password-code:${userId}:${challengeId}:${code}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function config() {
  return {
    url: Deno.env.get("SUPABASE_URL"),
    anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    accessToken: Deno.env.get("META_WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID"),
    templateLanguage: Deno.env.get("META_WHATSAPP_TEMPLATE_LANGUAGE"),
    graphApiVersion: Deno.env.get("META_WHATSAPP_GRAPH_API_VERSION") ?? "v23.0",
    developmentMode: Deno.env.get("WHATSAPP_DEVELOPMENT_MODE")?.trim().toLowerCase() === "true",
    developmentRecipient: Deno.env.get("WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE"),
  };
}

/**
 * Sets the password through Auth with the caller's own session, so Auth keeps that session and
 * signs out every other one. Never uses a recovery session or an administrator password reset.
 */
async function updatePassword(url: string, anonKey: string, bearer: string, password: string) {
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "PUT",
      headers: { apikey: anonKey, authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { kind: "changed" as const };
    const body = await response.json().catch(() => null);
    const code = typeof body?.error_code === "string" ? body.error_code : typeof body?.code === "string" ? body.code : null;
    // 4xx: Auth reached a decision and the password is unchanged.
    if (response.status >= 400 && response.status < 500) {
      return { kind: "rejected" as const, code, message: typeof body?.msg === "string" ? body.msg : null };
    }
    return { kind: "uncertain" as const };
  } catch {
    return { kind: "uncertain" as const };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return respond({ error: "not_authenticated" }, 401);

  const settings = config();
  if (!settings.url || !settings.serviceKey || !settings.anonKey) {
    console.error("Account password function is missing required secrets.");
    return respond({ error: "unavailable" }, 503);
  }

  const admin = createClient(settings.url, settings.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer);
  const claims = claimsOf(bearer);
  const sessionId = typeof claims?.session_id === "string" && UUID_PATTERN.test(claims.session_id) ? claims.session_id : null;
  const amr = claims?.amr;
  const phoneCode = !Array.isArray(amr) || amr.some((entry) => PHONE_CODE_METHODS.has(entry?.method));
  if (authError || !auth.user || !sessionId || phoneCode) return respond({ error: "not_authenticated" }, 401);
  const userId = auth.user.id;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return respond({ error: "invalid_request" }, 400);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return respond({ error: "invalid_request" }, 400);
    body = parsed;
  } catch {
    return respond({ error: "invalid_request" }, 400);
  }

  const challengeId = typeof body.challengeId === "string" && UUID_PATTERN.test(body.challengeId) ? body.challengeId : null;

  if (body.action === "request") {
    if (!settings.developmentMode && (!settings.accessToken || !settings.phoneNumberId || !settings.templateLanguage)) {
      return respond({ error: "delivery_unavailable" }, 503);
    }
    try {
      if (await deliveryBlocked(settings.url, settings.serviceKey, { userId })) return respond({ error: "unsupported_account" }, 403);
    } catch {
      console.error("Account password registry check failed");
      return respond({ error: "unavailable" }, 503);
    }
    const id = crypto.randomUUID();
    const code = randomCode();
    const { data, error } = await admin.rpc("start_account_password_challenge", {
      p_user_id: userId, p_session_id: sessionId, p_challenge_id: id,
      p_code_hash: await hashCode(settings.serviceKey, userId, id, code),
    });
    if (error) {
      console.error("Could not start password challenge", { code: error.code });
      return respond({ error: "unavailable" }, 503);
    }
    const started = data as { result: string; phone?: string; expires_at?: string; retry_at?: string };
    if (started.result !== "sent" || !started.phone) {
      const status = started.result === "cooldown" || started.result === "rate_limited" ? 429
        : started.result === "session_inactive" ? 401 : 400;
      return respond({ error: started.result, retryAt: started.retry_at ?? null }, status);
    }

    const phone = e164(started.phone);
    const cancel = () => admin.rpc("cancel_account_password_challenge", { p_user_id: userId, p_challenge_id: id });
    try {
      if (await deliveryBlocked(settings.url, settings.serviceKey, { phone })) {
        await cancel();
        return respond({ error: "unsupported_recipient" }, 403);
      }
    } catch {
      console.error("Password code registry check failed");
      await cancel();
      return respond({ error: "delivery_unavailable" }, 503);
    }
    if (settings.developmentMode) {
      // Development projects use fake numbers; the code is logged for manual verification.
      console.log("EDRA_DEV_PASSWORD_CODE", { phoneLast4: phone.slice(-4), code });
    }
    const deliveryPhone = settings.developmentMode ? settings.developmentRecipient : phone;
    if (deliveryPhone && settings.accessToken && settings.phoneNumberId) {
      const name = typeof auth.user.user_metadata?.full_name === "string"
        ? auth.user.user_metadata.full_name.trim().replace(/\s+/g, " ").slice(0, 60) || "there"
        : "there";
      const message = settings.developmentMode
        ? buildWhatsAppDevelopmentMessage(e164(deliveryPhone), name, code, phone)
        : buildWhatsAppTemplateMessage(phone, code, settings.templateLanguage!);
      const delivery = await deliverWithRetry(message, {
        accessToken: settings.accessToken, phoneNumberId: settings.phoneNumberId, graphApiVersion: settings.graphApiVersion,
      }, fetch);
      if (!delivery.ok) {
        console.error("Password code delivery failed", { metaStatus: delivery.status ?? null, developmentMode: settings.developmentMode });
        if (!settings.developmentMode) {
          await cancel();
          return respond({ error: "delivery_failed" }, 502);
        }
      }
    } else if (!settings.developmentMode) {
      await cancel();
      return respond({ error: "delivery_unavailable" }, 503);
    }
    return respond({ challenge: { id, phoneLast4: phone.slice(-4), expiresAt: started.expires_at, retryAt: started.retry_at } });
  }

  if (!challengeId) return respond({ error: "invalid_request" }, 400);

  if (body.action === "cancel") {
    const { error } = await admin.rpc("cancel_account_password_challenge", { p_user_id: userId, p_challenge_id: challengeId });
    return error ? respond({ error: "unavailable" }, 503) : respond({ canceled: true });
  }

  if (body.action === "verify") {
    if (typeof body.code !== "string" || !CODE_PATTERN.test(body.code)) return respond({ error: "invalid_code" }, 400);
    const { data: status, error } = await admin.rpc("verify_account_password_challenge", {
      p_user_id: userId, p_session_id: sessionId, p_challenge_id: challengeId,
      p_code_hash: await hashCode(settings.serviceKey, userId, challengeId, body.code),
    });
    if (error) {
      console.error("Could not verify password challenge", { code: error.code });
      return respond({ error: "unavailable" }, 503);
    }
    if (status !== "verified") return respond({ error: status === "invalid" ? "invalid_code" : status }, 400);
    return respond({ verified: true });
  }

  if (body.action === "complete") {
    const password = body.password;
    if (typeof password !== "string" || password.length < PASSWORD_MIN || new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
      return respond({ error: "invalid_password" }, 400);
    }
    const { data: claim, error } = await admin.rpc("claim_account_password_change", {
      p_user_id: userId, p_session_id: sessionId, p_challenge_id: challengeId,
    });
    if (error) {
      console.error("Could not claim password change", { code: error.code });
      return respond({ error: "unavailable" }, 503);
    }
    if (claim !== "claimed") return respond({ error: claim }, claim === "busy" ? 409 : 400);

    const outcome = await updatePassword(settings.url, settings.anonKey, bearer, password);
    if (outcome.kind === "uncertain") {
      // The attempt stays counted and its lease expires; the challenge is not consumed.
      return respond({ error: "uncertain" }, 502);
    }
    const { error: finishError } = await admin.rpc("finish_account_password_change", {
      p_user_id: userId, p_challenge_id: challengeId, p_changed: outcome.kind === "changed",
    });
    if (finishError) console.error("Could not finish password change", { code: finishError.code });
    if (outcome.kind === "rejected") {
      // reauthentication_needed only occurs if the hosted secure password change setting is enabled.
      return respond({ error: "password_rejected", code: outcome.code, message: outcome.message }, 422);
    }
    return respond({ changed: true });
  }

  return respond({ error: "invalid_action" }, 400);
});
