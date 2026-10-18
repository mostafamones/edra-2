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
const PHONE_CODE_METHODS = new Set(["otp", "recovery", "magiclink"]);
const PURPOSES = new Set(["login_phone", "parent_phone"]);

type Purpose = "login_phone" | "parent_phone";
type Row = {
  purpose: Purpose; operation_id: string; session_id: string; old_phone: string; new_phone: string;
  stage: string; code_hash: string | null; expires_at: string | null; old_sent_at: string | null; new_sent_at: string | null;
};

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

/** Mirrors src/lib/phone.ts normalizeEgyptianPhone. */
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

/** A code proves only this purpose, stage, account, operation and recipient. */
async function hashCode(secret: string, parts: { purpose: string; stage: string; userId: string; operationId: string; recipient: string }, code: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = `edra-account-contact-code:${parts.purpose}:${parts.stage}:${parts.userId}:${parts.operationId}:${parts.recipient.replace(/^\+/, "")}:${code}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
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

type Settings = ReturnType<typeof config>;

function deliveryReady(settings: Settings) {
  return settings.developmentMode || Boolean(settings.accessToken && settings.phoneNumberId && settings.templateLanguage);
}

/** Sends a code through the shared WhatsApp adapter. Production fails on any delivery failure. */
async function deliver(settings: Settings, recipient: string, code: string, name: string) {
  const phone = e164(recipient);
  if (settings.developmentMode) {
    // Development projects use fake numbers; the code is logged for manual verification.
    console.log("EDRA_DEV_CONTACT_CODE", { phoneLast4: phone.slice(-4), code });
  }
  const deliveryPhone = settings.developmentMode ? settings.developmentRecipient : phone;
  if (!deliveryPhone || !settings.accessToken || !settings.phoneNumberId) {
    return settings.developmentMode ? null : "delivery_unavailable";
  }
  const message = settings.developmentMode
    ? buildWhatsAppDevelopmentMessage(e164(deliveryPhone), name, code, phone)
    : buildWhatsAppTemplateMessage(phone, code, settings.templateLanguage!);
  const delivery = await deliverWithRetry(message, {
    accessToken: settings.accessToken, phoneNumberId: settings.phoneNumberId, graphApiVersion: settings.graphApiVersion,
  }, fetch);
  if (delivery.ok) return null;
  console.error("Contact code delivery failed", { metaStatus: delivery.status ?? null, developmentMode: settings.developmentMode });
  return settings.developmentMode ? null : "delivery_failed";
}

/** What the browser may know about an operation: never its codes or hashes. */
function view(row: Row) {
  const codeStage = row.stage === "old" || row.stage === "new";
  const sentAt = row.stage === "old" ? row.old_sent_at : row.stage === "new" ? row.new_sent_at : null;
  const recipient = row.stage === "old" ? row.old_phone : row.new_phone;
  return {
    id: row.operation_id,
    purpose: row.purpose,
    stage: row.stage === "committing" ? "verified" : row.stage,
    newPhone: row.new_phone,
    recipientLast4: recipient.slice(-4),
    codeSent: codeStage && Boolean(row.code_hash),
    expiresAt: row.expires_at,
    retryAt: sentAt && codeStage ? new Date(Date.parse(sentAt) + 60_000).toISOString() : null,
  };
}

/**
 * Asks Auth to replace this user's phone, marking it confirmed because both proofs passed. The
 * auth.users guard trigger accepts the write only for this committing operation, so a late or
 * duplicate write cannot apply after the operation was settled.
 */
async function updateAuthPhone(url: string, serviceKey: string, userId: string, phone: string) {
  try {
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ phone, phone_confirm: true }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return "changed";
    const body = await response.json().catch(() => null);
    const code = typeof body?.error_code === "string" ? body.error_code : typeof body?.code === "string" ? body.code : null;
    return code === "phone_exists" ? "phone_taken" : "failed";
  } catch {
    return "failed";
  }
}

const STATUS: Record<string, number> = {
  cooldown: 429, rate_limited: 429, session_inactive: 401, busy: 409, phone_taken: 409,
  delivery_failed: 502, delivery_unavailable: 503, unavailable: 503,
};

function failure(error: string, extra: Record<string, unknown> = {}) {
  return respond({ error, ...extra }, STATUS[error] ?? 400);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return respond({ error: "not_authenticated" }, 401);

  const settings = config();
  if (!settings.url || !settings.serviceKey) {
    console.error("Account contact function is missing required secrets.");
    return failure("unavailable");
  }
  const serviceKey = settings.serviceKey;

  const admin = createClient(settings.url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer);
  const claims = claimsOf(bearer);
  const sessionId = typeof claims?.session_id === "string" && UUID_PATTERN.test(claims.session_id) ? claims.session_id : null;
  const amr = claims?.amr;
  const phoneCode = !Array.isArray(amr) || amr.some((entry) => PHONE_CODE_METHODS.has(entry?.method));
  if (authError || !auth.user || !sessionId || phoneCode) return respond({ error: "not_authenticated" }, 401);
  const user = auth.user;
  const userId = user.id;
  const name = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name.trim().replace(/\s+/g, " ").slice(0, 60) || "there"
    : "there";

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return failure("invalid_request");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure("invalid_request");
    body = parsed;
  } catch {
    return failure("invalid_request");
  }

  const ROW_COLUMNS = "purpose, operation_id, session_id, old_phone, new_phone, stage, code_hash, expires_at, old_sent_at, new_sent_at";
  async function loadRow(operationId: string) {
    const { data, error } = await admin.from("account_contact_changes").select(ROW_COLUMNS)
      .eq("operation_id", operationId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.code);
    return data as Row | null;
  }
  const hashFor = (row: Pick<Row, "purpose" | "operation_id">, stage: string, recipient: string, code: string) =>
    hashCode(serviceKey, { purpose: row.purpose, stage, userId, operationId: row.operation_id, recipient }, code);

  /** Generates, records and delivers a code for a stage. A failed production delivery voids the code. */
  async function sendCode(row: Row, stage: "old" | "new") {
    const code = randomCode();
    const recipient = stage === "old" ? row.old_phone : row.new_phone;
    const { data, error } = await admin.rpc("resend_contact_change_code", {
      p_user_id: userId, p_session_id: sessionId, p_operation_id: row.operation_id, p_stage: stage,
      p_code_hash: await hashFor(row, stage, recipient, code),
    });
    if (error) {
      console.error("Could not record contact code", { code: error.code });
      return { error: "unavailable" };
    }
    const sent = data as { result: string; retry_at?: string };
    if (sent.result !== "sent") return { error: sent.result, retryAt: sent.retry_at ?? null };
    const deliveryError = await deliver(settings, recipient, code, name);
    if (deliveryError) {
      // The send stays counted; replacing the hash makes the undelivered code unusable.
      await admin.from("account_contact_changes").update({ code_hash: null }).eq("operation_id", row.operation_id).eq("stage", stage);
      return { error: deliveryError };
    }
    return null;
  }

  /** Claims, performs and settles the Auth phone update for a verified login operation. */
  async function commitLogin(operationId: string) {
    const { data: claim, error } = await admin.rpc("claim_login_phone_change", {
      p_user_id: userId, p_session_id: sessionId, p_operation_id: operationId,
    });
    if (error) {
      console.error("Could not claim phone change", { code: error.code });
      return failure("unavailable");
    }
    const claimed = claim as { result: string; phone?: string };
    if (claimed.result !== "claimed" || !claimed.phone) return failure(claimed.result);
    const outcome = await updateAuthPhone(settings.url!, serviceKey, userId, claimed.phone);
    // Settling serializes with Auth's transaction through the operation row, so it either sees the
    // trigger's completion or releases the claim and makes any delayed Auth write fail.
    const { data: settled, error: settleError } = await admin.rpc("settle_login_phone_change", {
      p_user_id: userId, p_operation_id: operationId, p_end: outcome === "phone_taken",
    });
    if (settleError) {
      console.error("Could not settle phone change", { code: settleError.code });
      return failure("uncertain");
    }
    if (settled === "completed") return respond({ completed: true });
    if (outcome === "phone_taken") return failure("phone_taken");
    return failure(settled === "retry" ? "commit_failed" : "ended");
  }

  const operationId = typeof body.operationId === "string" && UUID_PATTERN.test(body.operationId) ? body.operationId : null;

  try {
    if (body.action === "status") {
      const [{ data: rows, error }, { data: student, error: studentError }] = await Promise.all([
        admin.from("account_contact_changes").select(ROW_COLUMNS)
          .eq("user_id", userId).eq("session_id", sessionId).in("stage", ["old", "new", "verified", "committing"]),
        admin.from("student_profiles").select("parent_phone").eq("user_id", userId)
          .not("level_id", "is", null).not("parent_phone_verified_at", "is", null).maybeSingle(),
      ]);
      if (error || studentError) throw new Error((error ?? studentError)!.code);
      const operations: ReturnType<typeof view>[] = [];
      for (const row of (rows ?? []) as Row[]) {
        if (row.stage === "committing") {
          // A previous completion lost its response: reconcile it before reporting.
          const { data: settled } = await admin.rpc("settle_login_phone_change", { p_user_id: userId, p_operation_id: row.operation_id, p_end: false });
          if (settled !== "retry") continue;
          row.stage = "verified";
        }
        operations.push(view(row));
      }
      const { data: fresh } = await admin.auth.admin.getUserById(userId);
      const current = fresh?.user ?? user;
      return respond({
        loginPhone: current.phone && current.phone_confirmed_at ? e164(current.phone) : null,
        parentPhone: student?.parent_phone ?? null,
        operations,
      });
    }

    if (body.action === "start") {
      if (typeof body.purpose !== "string" || !PURPOSES.has(body.purpose)) return failure("invalid_request");
      const purpose = body.purpose as Purpose;
      const replacement = normalizePhone(body.phone);
      if (!replacement) return failure("invalid_phone");
      if (!deliveryReady(settings)) return failure("delivery_unavailable");

      let expectedOld: string | null = null;
      if (purpose === "login_phone") {
        expectedOld = user.phone_confirmed_at && user.phone ? user.phone : null;
        if (!expectedOld) return failure("phone_unverified");
      } else {
        const { data, error } = await admin.from("student_profiles").select("parent_phone").eq("user_id", userId)
          .not("level_id", "is", null).not("parent_phone_verified_at", "is", null).maybeSingle();
        if (error) throw new Error(error.code);
        expectedOld = data?.parent_phone ?? null;
        if (!expectedOld) return failure("not_student");
      }
      if (e164(expectedOld) === replacement) return failure("same_phone");

      const id = crypto.randomUUID();
      const code = randomCode();
      const { data, error } = await admin.rpc("start_contact_change", {
        p_user_id: userId, p_session_id: sessionId, p_purpose: purpose, p_operation_id: id,
        p_expected_old: expectedOld, p_new_phone: replacement,
        p_code_hash: await hashFor({ purpose, operation_id: id }, "old", expectedOld, code),
      });
      if (error) {
        console.error("Could not start contact change", { code: error.code });
        return failure("unavailable");
      }
      const started = data as { result: string; retry_at?: string };
      if (started.result !== "sent") return failure(started.result, { retryAt: started.retry_at ?? null });
      const deliveryError = await deliver(settings, expectedOld, code, name);
      if (deliveryError) {
        await admin.rpc("cancel_contact_change", { p_user_id: userId, p_operation_id: id });
        return failure(deliveryError);
      }
      const row = await loadRow(id);
      return row ? respond({ operation: view(row) }) : failure("unavailable");
    }

    if (!operationId) return failure("invalid_request");

    if (body.action === "cancel") {
      const { data, error } = await admin.rpc("cancel_contact_change", { p_user_id: userId, p_operation_id: operationId });
      if (error) throw new Error(error.code);
      return data === "busy" ? failure("busy") : respond({ canceled: true });
    }

    const row = await loadRow(operationId);
    if (!row || row.session_id !== sessionId) return failure("invalid");
    if (row.stage === "completed" || row.stage === "canceled") return failure("used");

    if (body.action === "resend") {
      if (row.stage !== "old" && row.stage !== "new") return failure("invalid");
      if (!deliveryReady(settings)) return failure("delivery_unavailable");
      const sent = await sendCode(row, row.stage);
      if (sent) return failure(sent.error, { retryAt: sent.retryAt ?? null });
      const updated = await loadRow(operationId);
      return updated ? respond({ operation: view(updated) }) : failure("unavailable");
    }

    if (body.action === "verify") {
      if (row.stage !== "old" && row.stage !== "new") return failure("invalid");
      if (typeof body.code !== "string" || !CODE_PATTERN.test(body.code)) return failure("invalid_code");
      const recipient = row.stage === "old" ? row.old_phone : row.new_phone;
      const { data: result, error } = await admin.rpc("verify_contact_change_code", {
        p_user_id: userId, p_session_id: sessionId, p_operation_id: operationId, p_stage: row.stage,
        p_code_hash: await hashFor(row, row.stage, recipient, body.code),
      });
      if (error) throw new Error(error.code);
      if (result === "completed") return respond({ completed: true });
      if (result === "verified") return commitLogin(operationId);
      if (result !== "next") return failure(result as string);
      // The old contact is proven; send the replacement's code. A failure leaves resend available.
      const sent = deliveryReady(settings) ? await sendCode({ ...row, stage: "new" }, "new") : { error: "delivery_unavailable" };
      const updated = await loadRow(operationId);
      if (!updated) return failure("unavailable");
      return respond({ operation: view(updated), ...(sent ? { sendError: sent.error } : {}) });
    }

    if (body.action === "complete") {
      if (row.purpose !== "login_phone") return failure("invalid");
      return commitLogin(operationId);
    }
  } catch (error) {
    console.error("Account contact request failed", { code: error instanceof Error ? error.message : null });
    return failure("unavailable");
  }

  return failure("invalid_action");
});
