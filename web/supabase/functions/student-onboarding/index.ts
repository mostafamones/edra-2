import { createClient } from "@supabase/supabase-js";

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

const PHONE_PATTERN = /^\+201[0125]\d{8}$/;
const CODE_PATTERN = /^\d{6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("0020")) phone = phone.slice(4);
  else if (phone.startsWith("+20")) phone = phone.slice(3);
  else if (phone.startsWith("20")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = phone.slice(1);
  const normalized = `+20${phone}`;
  return PHONE_PATTERN.test(normalized) ? normalized : null;
}

function randomCode() {
  const values = new Uint32Array(1);
  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % 1000000).padStart(6, "0");
}

async function hashCode(secret: string, userId: string, challengeId: string, code: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`edra-student-parent-code:${userId}:${challengeId}:${code}`),
  );
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function config() {
  return {
    url: Deno.env.get("SUPABASE_URL"),
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    accessToken: Deno.env.get("META_WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID"),
    templateLanguage: Deno.env.get("META_WHATSAPP_TEMPLATE_LANGUAGE"),
    graphApiVersion: Deno.env.get("META_WHATSAPP_GRAPH_API_VERSION") ?? "v23.0",
    developmentMode: Deno.env.get("WHATSAPP_DEVELOPMENT_MODE")?.trim().toLowerCase() === "true",
    developmentRecipient: Deno.env.get("WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE"),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return respond({ error: "not_authenticated" }, 401);

  const settings = config();
  if (!settings.url || !settings.serviceKey) {
    console.error("Student onboarding function is missing required secrets.");
    return respond({ error: "unavailable" }, 503);
  }

  const admin = createClient(settings.url, settings.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !auth.user) return respond({ error: "not_authenticated" }, 401);

  const accountPhone = normalizePhone(auth.user.phone);
  if (!accountPhone || !auth.user.phone_confirmed_at) {
    return respond({ error: "account_phone_unverified" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return respond({ error: "invalid_request" }, 400);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return respond({ error: "invalid_request" }, 400);
    }
    body = parsed;
  } catch {
    return respond({ error: "invalid_request" }, 400);
  }

  const userId = auth.user.id;

  if (body.action === "status") {
    const { data, error } = await admin
      .from("student_phone_challenges")
      .select("challenge_id, phone, sent_at, expires_at, attempts, consumed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return respond({ error: "unavailable" }, 503);
    if (!data) return respond({ challenge: null, retryAt: null });
    const retryAt = new Date(Date.parse(data.sent_at) + 60000).toISOString();
    if (data.consumed_at || data.attempts >= 5 || Date.parse(data.expires_at) <= Date.now()) {
      return respond({ challenge: null, retryAt: Date.parse(retryAt) > Date.now() ? retryAt : null });
    }
    return respond({
      challenge: {
        id: data.challenge_id,
        phone: data.phone,
        expiresAt: data.expires_at,
        retryAt,
      },
      retryAt,
    });
  }

  if (body.action === "invalidate") {
    const challengeId = body.challengeId;
    if (typeof challengeId !== "string" || !UUID_PATTERN.test(challengeId)) {
      return respond({ error: "invalid_request" }, 400);
    }
    const { error } = await admin
      .from("student_phone_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("challenge_id", challengeId)
      .is("consumed_at", null);
    if (error) return respond({ error: "unavailable" }, 503);
    return respond({ invalidated: true });
  }

  if (body.action === "request") {
    const phone = normalizePhone(body.phone);
    if (!phone) return respond({ error: "invalid_phone" }, 400);
    if (phone === accountPhone) return respond({ error: "same_phone" }, 400);

    if (!settings.developmentMode &&
      (!settings.accessToken || !settings.phoneNumberId || !settings.templateLanguage)) {
      return respond({ error: "delivery_unavailable" }, 503);
    }

    const challengeId = crypto.randomUUID();
    const code = randomCode();
    const codeHash = await hashCode(settings.serviceKey, userId, challengeId, code);
    const { data: status, error: reserveError } = await admin.rpc("start_student_parent_challenge", {
      p_user_id: userId,
      p_challenge_id: challengeId,
      p_phone: phone,
      p_code_hash: codeHash,
    });
    if (reserveError) {
      console.error("Could not reserve parent challenge", { code: reserveError.code });
      return respond({ error: "unavailable" }, 503);
    }
    if (status !== "sent") {
      const httpStatus = status === "cooldown" || status === "rate_limited" ? 429 : 400;
      return respond({ error: status }, httpStatus);
    }

    if (settings.developmentMode) {
      // The development Supabase project uses fake numbers. Every code is logged
      // for manual verification, regardless of Meta's test-recipient delivery.
      console.log("EDRA_DEV_PARENT_CODE", { phone, code });
    }

    const deliveryPhone = settings.developmentMode
      ? normalizePhone(settings.developmentRecipient)
      : phone;
    if (deliveryPhone && settings.accessToken && settings.phoneNumberId) {
      const name = typeof auth.user.user_metadata?.full_name === "string"
        ? auth.user.user_metadata.full_name.trim().replace(/\s+/g, " ").slice(0, 60) || "there"
        : "there";
      const message = settings.developmentMode
        ? buildWhatsAppDevelopmentMessage(deliveryPhone, name, code, phone)
        : buildWhatsAppTemplateMessage(deliveryPhone, code, settings.templateLanguage!);
      const delivery = await deliverWithRetry(message, {
        accessToken: settings.accessToken,
        phoneNumberId: settings.phoneNumberId,
        graphApiVersion: settings.graphApiVersion,
      }, fetch);
      if (!delivery.ok) {
        console.error("Parent verification delivery failed", {
          metaStatus: delivery.status ?? null,
          developmentMode: settings.developmentMode,
        });
        if (!settings.developmentMode) {
          await admin.from("student_phone_challenges")
            .update({ consumed_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("challenge_id", challengeId);
          return respond({ error: "delivery_failed" }, 502);
        }
      }
    } else if (!settings.developmentMode) {
      await admin.from("student_phone_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("challenge_id", challengeId);
      return respond({ error: "delivery_unavailable" }, 503);
    }

    return respond({
      challenge: {
        id: challengeId,
        phone,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        retryAt: new Date(Date.now() + 60000).toISOString(),
      },
    });
  }

  if (body.action === "verify") {
    const challengeId = body.challengeId;
    const code = body.code;
    if (typeof challengeId !== "string" || !UUID_PATTERN.test(challengeId) ||
      typeof code !== "string" || !CODE_PATTERN.test(code)) {
      return respond({ error: "invalid_code" }, 400);
    }
    const codeHash = await hashCode(settings.serviceKey, userId, challengeId, code);
    const { data: status, error } = await admin.rpc("verify_student_parent_challenge", {
      p_user_id: userId,
      p_challenge_id: challengeId,
      p_code_hash: codeHash,
    });
    if (error) {
      console.error("Could not verify parent challenge", { code: error.code });
      return respond({ error: "unavailable" }, 503);
    }
    if (status !== "verified") return respond({ error: status === "invalid" ? "invalid_code" : status }, 400);
    return respond({ verified: true });
  }

  if (body.action === "complete") {
    if (typeof body.levelId !== "string" || !/^[a-z0-9-]{1,40}$/.test(body.levelId)) {
      return respond({ error: "invalid_level" }, 400);
    }
    const { data: completed, error } = await admin.rpc("finish_student_profile", {
      p_user_id: userId,
      p_level_id: body.levelId,
    });
    if (error) {
      console.error("Could not complete student profile", { code: error.code });
      return respond({ error: "unavailable" }, 503);
    }
    if (!completed) return respond({ error: "profile_incomplete" }, 400);
    return respond({ completed: true });
  }

  return respond({ error: "invalid_action" }, 400);
});
