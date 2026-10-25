import "server-only";

import { randomUUID } from "node:crypto";

import { createClient as createSupabaseClient, type Session } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { platformOrigin, staffAcademyHref, staffAcademyPath, studentAcademyHref } from "@/lib/routing";
import { authCookieOptions } from "@/lib/supabase/cookie-policy";
import { createClient } from "@/lib/supabase/server";
import { isPhoneCodeSession } from "@/lib/supabase/session-grade";
import { accountName } from "@/modules/account/contract";

import { developmentConfig, type DevelopmentConfig } from "./config";
import { hashControlToken, newControlToken, open, seal } from "./crypto";
import { exitPath, staffPreviewPath, studentsDirectoryPath } from "./paths";
import type { PreviewErrorCode, PreviewIdentity, PreviewResult, PreviewRole, PreviewStatus } from "./types";

export const CONTROL_COOKIE = "edra-dev-control";
const CONTROL_SECONDS = 2 * 60 * 60;
const STAFF_ENTRY = "account:staff:owner";
const STUDENT_ID = /^account:student:[a-z0-9-]+$/;

type Pair = { access_token: string; refresh_token: string };
type Control = {
  id: string; run_id: string; academy_slug: string; developer_id: string; original_session_id: string; return_path: string;
  current_logical_id: string | null; current_session_id: string | null; prior_logical_id: string | null;
  prior_return_path: string | null; revision: number; expires_at: string; ended_at: string | null; live: boolean;
  replay_session_id: string | null;
};
type Targets = {
  staff: { logical_id: string; role: Exclude<PreviewRole, "student">; display_name: string }[];
  students: { logical_id: string; display_name: string; annual_student_record_id: string }[];
};
type Claims = { sub: string; session_id: string };

const fail = (error: PreviewErrorCode, destination?: string): PreviewResult => ({ ok: false, error, ...(destination ? { destination } : {}) });

function adminClient(config: DevelopmentConfig) {
  return createSupabaseClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Service-role RPC to the private registry adapters; errors surface as exceptions, never as data. */
async function rpc<T>(config: DevelopmentConfig, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient(config).rpc(name, args);
  if (error) throw new Error(`Developer mode registry call failed (${error.code ?? "error"}).`);
  return data as T;
}

/** Payload of a JWT this server just received from Auth or verified with getClaims. */
function sessionIdOf(accessToken: string) {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { session_id?: unknown };
  if (typeof payload.session_id !== "string") throw new Error("Session has no id.");
  return payload.session_id;
}

/** The verified cookie session (password-grade) and the SSR client that writes auth cookies. */
async function cookieSession() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  const valid = claims && typeof claims.sub === "string" && typeof claims.session_id === "string" && !isPhoneCodeSession(claims);
  return { db, claims: valid ? { sub: claims.sub, session_id: claims.session_id as string } as Claims : null };
}

function controlCookie(value: string, maxAge: number) {
  const { domain } = authCookieOptions();
  return {
    name: CONTROL_COOKIE, value, domain, path: "/", httpOnly: true, sameSite: "lax" as const, maxAge,
    secure: platformOrigin("staff").startsWith("https:"),
  };
}

async function readControl(config: DevelopmentConfig): Promise<Control | null> {
  const token = (await cookies()).get(CONTROL_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return rpc<Control | null>(config, "dev_control_state", { p_token_hash: hashControlToken(token) });
}

/** True when the cookie session is one this control issued or the developer's own original session. */
function sessionOfControl(control: Control, claims: Claims | null) {
  if (!claims) return false;
  if (claims.session_id === control.original_session_id) return claims.sub === control.developer_id;
  return claims.session_id === control.current_session_id || claims.session_id === control.replay_session_id;
}

const originalContext = (config: DevelopmentConfig, control: { id: string; run_id: string }) =>
  ({ purpose: "original-session", projectRef: config.projectRef, runId: control.run_id, subject: control.id });
const receiptContext = (config: DevelopmentConfig, runId: string, commandId: string) =>
  ({ purpose: "issued-session", projectRef: config.projectRef, runId, subject: commandId });
const pairOf = (session: Pick<Session, "access_token" | "refresh_token">): Pair =>
  ({ access_token: session.access_token, refresh_token: session.refresh_token });

/** Revokes one issued session through the Admin API, refreshing an expired access token first. */
async function revokeSession(config: DevelopmentConfig, pair: Pair, scope: "local" | "global" = "local") {
  const admin = adminClient(config);
  const { error } = await admin.auth.admin.signOut(pair.access_token, scope);
  if (!error) return;
  const transient = createSupabaseClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await transient.auth.refreshSession({ refresh_token: pair.refresh_token });
  // An unrefreshable session has already ended.
  if (!data.session) return;
  const retry = await admin.auth.admin.signOut(data.session.access_token, scope);
  if (retry.error) throw new Error("Issued session could not be revoked.");
}

/** Revokes this control's issued sessions except the kept ones; failures stay retryable. */
async function revokeIssued(config: DevelopmentConfig, control: { id: string; run_id: string }, keep: (string | null)[]) {
  const sessions = await rpc<{ session_id: string; receipt: string }[]>(config, "dev_control_sessions", {
    p_control_id: control.id, p_keep: keep.filter(Boolean),
  });
  let failed = false;
  for (const issued of sessions) {
    try {
      await revokeSession(config, JSON.parse(openReceipt(config, control.run_id, issued.receipt)) as Pair);
      await rpc(config, "dev_session_revoked", { p_control_id: control.id, p_session_id: issued.session_id });
    } catch {
      failed = true;
    }
  }
  return !failed;
}

/** Receipts are sealed per command; the command ID is recovered from the receipt envelope. */
function sealReceipt(config: DevelopmentConfig, runId: string, commandId: string, pair: Pair) {
  return `${commandId}~${seal(config.key, JSON.stringify(pair), receiptContext(config, runId, commandId))}`;
}
function openReceipt(config: DevelopmentConfig, runId: string, receipt: string) {
  const [commandId, sealed] = receipt.split("~");
  return open(config.key, sealed ?? "", receiptContext(config, runId, commandId ?? ""));
}

function destinationFor(slug: string, logicalId: string | null, staffPath?: string | null) {
  if (logicalId && STUDENT_ID.test(logicalId)) return studentAcademyHref(slug);
  return staffPath ? platformOrigin("staff") + staffPath : staffAcademyHref(slug);
}

type SwitchPlan = {
  config: DevelopmentConfig; control: Control; claims: Claims; db: Awaited<ReturnType<typeof createClient>>;
  kind: "enter" | "switch" | "return"; target: string | null; commandId: string; expectedRevision: number;
  prior?: { logicalId: string | null; returnPath: string | null } | null;
  staffPath?: string | null;
};

/**
 * One serialized identity change: begin (lease + revision CAS), mint or restore, durably complete,
 * then publish cookies and revoke superseded sessions. A replay of the latest command re-emits its
 * stored session; an older command is stale and never rolls the browser back.
 */
async function performSwitch(plan: SwitchPlan): Promise<PreviewResult> {
  const { config, control, claims, db, target } = plan;
  const begun = await rpc<{ result: string; revision?: number; receipt?: string | null; target_logical_id?: string | null }>(
    config, "dev_command_begin", {
      p_control_id: control.id, p_command_id: plan.commandId, p_expected_revision: plan.expectedRevision, p_kind: plan.kind,
      p_target_logical_id: target, p_previous_session_id: claims.session_id,
    });

  if (begun.result === "replay") {
    const pair = begun.receipt
      ? JSON.parse(openReceipt(config, control.run_id, begun.receipt)) as Pair
      : JSON.parse(open(config.key, await rpc<string>(config, "dev_control_original", { p_control_id: control.id }), originalContext(config, control))) as Pair;
    const { error } = await db.auth.setSession(pair);
    if (error) return fail("session_inactive");
    return { ok: true, revision: begun.revision, destination: destinationFor(control.academy_slug, begun.target_logical_id ?? null, plan.staffPath) };
  }
  if (begun.result !== "begun") return fail(begun.result as PreviewErrorCode);

  // Leaving the real identity: keep the freshest original pair, which the browser may have refreshed.
  let originalTokens: string | null = null;
  if (control.current_logical_id === null && claims.session_id === control.original_session_id) {
    const { data } = await db.auth.getSession();
    if (data.session && sessionIdOf(data.session.access_token) === control.original_session_id) {
      originalTokens = seal(config.key, JSON.stringify(pairOf(data.session)), originalContext(config, control));
    }
  }
  const prior = plan.prior;
  const complete = (sessionId: string | null, userId: string | null, receipt: string | null, original: string | null) =>
    rpc<string>(config, "dev_command_complete", {
      p_control_id: control.id, p_command_id: plan.commandId, p_session_id: sessionId, p_user_id: userId, p_receipt: receipt,
      p_set_prior: prior !== undefined, p_prior_logical_id: prior?.logicalId ?? null, p_prior_return_path: prior?.returnPath ?? null,
      p_original_tokens: original,
    });

  if (target === null) {
    // Return to the real developer identity within the still-authorized control.
    const stored = JSON.parse(open(config.key, await rpc<string>(config, "dev_control_original", { p_control_id: control.id }), originalContext(config, control))) as Pair;
    const { data, error } = await db.auth.setSession(stored);
    if (error || !data.session) return fail("original_unavailable");
    const refreshed = seal(config.key, JSON.stringify(pairOf(data.session)), originalContext(config, control));
    if (await complete(null, null, null, refreshed) !== "completed") return fail("conflict");
  } else {
    const account = await rpc<{ user_id: string; phone: string; credential: string } | null>(config, "dev_account", {
      p_run_id: control.run_id, p_logical_id: target,
    });
    if (!account) return fail("invalid_target");
    const password = open(config.key, account.credential, {
      purpose: "account-password", projectRef: config.projectRef, runId: control.run_id, subject: account.user_id,
    });
    const transient = createSupabaseClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await transient.auth.signInWithPassword({ phone: account.phone, password });
    if (error || !data.session || data.session.user.id !== account.user_id) return fail("sign_in_failed");
    const pair = pairOf(data.session);
    const sessionId = sessionIdOf(pair.access_token);
    // Durable before the browser sees it, so a lost response can be replayed.
    if (await complete(sessionId, account.user_id, sealReceipt(config, control.run_id, plan.commandId, pair), originalTokens) !== "completed") {
      await revokeSession(config, pair).catch(() => {});
      return fail("conflict");
    }
    const { error: cookieError } = await db.auth.setSession(pair);
    if (cookieError) return fail("sign_in_failed");
  }
  // Keep the new session and the replay binding of this command; revoke older issued sessions.
  const currentSession = target === null ? null : (await db.auth.getSession()).data.session;
  await revokeIssued(config, control, [currentSession ? sessionIdOf(currentSession.access_token) : null, claims.session_id]);
  return { ok: true, revision: begun.revision, destination: destinationFor(control.academy_slug, target, plan.staffPath) };
}

async function activeContext() {
  const config = developmentConfig();
  if (!config) return null;
  const [{ db, claims }, control] = await Promise.all([cookieSession(), readControl(config)]);
  return { config, db, claims, control };
}

function identity(logicalId: string | null, targets: Targets, developerName: string): PreviewIdentity {
  if (logicalId === null) return { kind: "original", logicalId: null, displayName: developerName, role: "instructor" };
  const staff = targets.staff.find((entry) => entry.logical_id === logicalId);
  if (staff) return { kind: "staff", logicalId, displayName: staff.display_name, role: staff.role };
  const student = targets.students.find((entry) => entry.logical_id === logicalId);
  return { kind: "student", logicalId, displayName: student?.display_name ?? "Student", role: "student" };
}

/** Safe display state for the frame and menu entry. Never signs in or changes identity. */
export async function previewStatus(): Promise<PreviewStatus> {
  const context = await activeContext();
  if (!context?.claims) return { available: false };
  const { config, claims, control } = context;
  if (control?.live && sessionOfControl(control, claims)) {
    const [targets, developer] = await Promise.all([
      rpc<Targets>(config, "dev_run_targets", { p_run_id: control.run_id }),
      adminClient(config).from("profiles").select("full_name,display_name").eq("id", control.developer_id).maybeSingle(),
    ]);
    const developerName = accountName(developer.data) ?? "Developer";
    const current = identity(control.current_logical_id, targets, developerName);
    return {
      available: true, active: true, run: { id: control.run_id, academySlug: control.academy_slug }, revision: control.revision,
      expiresAt: control.expires_at, current,
      priorStaff: current.kind === "student" ? identity(control.prior_logical_id, targets, developerName) : null,
      staffTargets: targets.staff.map((entry) => ({ logicalId: entry.logical_id, displayName: entry.display_name, role: entry.role })),
      students: targets.students.map((entry) => ({ logicalId: entry.logical_id, displayName: entry.display_name, recordId: entry.annual_student_record_id })),
    };
  }
  if (!config.developerIds.has(claims.sub)) return { available: false };
  const preview = await rpc<{ allowlisted: boolean; run: { id: string; academy_slug: string } | null }>(config, "dev_preview_context", {
    p_developer_id: claims.sub,
  });
  if (!preview.allowlisted) return { available: false };
  if (!preview.run) return { available: true, active: false, run: null, students: [] };
  const targets = await rpc<Targets>(config, "dev_run_targets", { p_run_id: preview.run.id });
  return {
    available: true, active: false, run: { id: preview.run.id, academySlug: preview.run.academy_slug },
    students: targets.students.map((entry) => ({ logicalId: entry.logical_id, displayName: entry.display_name, recordId: entry.annual_student_record_id })),
  };
}

/** Enters Developer mode as the generated Owner, or directly as a generated student from the real directory. */
export async function enterPreview(input: { runId: string; studentLogicalId: string | null; returnTo: string | null }): Promise<PreviewResult> {
  const context = await activeContext();
  if (!context) return fail("unavailable");
  const { config, db, claims, control: existing } = context;
  if (existing?.live) return fail("nested");
  if (!claims || !config.developerIds.has(claims.sub)) return fail("forbidden");
  if (input.studentLogicalId !== null && !STUDENT_ID.test(input.studentLogicalId)) return fail("invalid_request");

  const preview = await rpc<{ allowlisted: boolean; run: { id: string; academy_slug: string } | null }>(config, "dev_preview_context", {
    p_developer_id: claims.sub,
  });
  if (!preview.allowlisted) return fail("forbidden");
  if (preview.run?.id !== input.runId) return fail("run_unavailable");
  const slug = preview.run.academy_slug;
  const directory = input.studentLogicalId ? studentsDirectoryPath(slug, input.returnTo) : null;
  if (input.studentLogicalId && !directory) return fail("invalid_request");

  const { data } = await db.auth.getSession();
  if (!data.session || data.session.user.id !== claims.sub || sessionIdOf(data.session.access_token) !== claims.session_id) {
    return fail("session_inactive");
  }
  const controlId = randomUUID();
  const { token, hash } = newControlToken();
  const opened = await rpc<string>(config, "dev_control_open", {
    p_control_id: controlId, p_token_hash: hash, p_run_id: input.runId, p_developer_id: claims.sub,
    p_original_session_id: claims.session_id,
    p_original_tokens: seal(config.key, JSON.stringify(pairOf(data.session)), originalContext(config, { id: controlId, run_id: input.runId })),
    p_return_path: input.studentLogicalId ? directory : exitPath(input.returnTo),
  });
  if (opened !== "opened") return fail(opened as PreviewErrorCode);
  (await cookies()).set(controlCookie(token, CONTROL_SECONDS));

  const control = await rpc<Control>(config, "dev_control_state", { p_token_hash: hash });
  return performSwitch({
    config, control, claims, db, kind: "enter", target: input.studentLogicalId ?? STAFF_ENTRY, commandId: randomUUID(), expectedRevision: 0,
    prior: input.studentLogicalId ? { logicalId: null, returnPath: directory } : undefined,
    staffPath: staffPreviewPath(slug, input.returnTo),
  });
}

/** Switches to another generated staff or student target of the same run. */
export async function switchPreview(input: {
  runId: string; logicalId: string; expectedRevision: number; commandId: string; returnTo: string | null;
}): Promise<PreviewResult> {
  const context = await activeContext();
  if (!context) return fail("unavailable");
  const { config, db, claims, control } = context;
  if (!control || !control.live || control.run_id !== input.runId) return fail("inactive");
  if (!claims || !sessionOfControl(control, claims)) return fail("session_mismatch");
  const toStudent = STUDENT_ID.test(input.logicalId);
  const fromStudent = control.current_logical_id !== null && STUDENT_ID.test(control.current_logical_id);
  // Entering student view remembers the current staff identity and its validated directory context;
  // moving between students keeps it, and a staff switch makes the new staff identity current.
  const prior = toStudent && !fromStudent ? {
    logicalId: control.current_logical_id,
    returnPath: studentsDirectoryPath(control.academy_slug, input.returnTo) ?? staffAcademyPath(control.academy_slug, "/students"),
  } : undefined;
  return performSwitch({
    config, control, claims, db, kind: "switch", target: input.logicalId, commandId: input.commandId,
    expectedRevision: input.expectedRevision, prior,
    staffPath: !fromStudent && !toStudent ? staffPreviewPath(control.academy_slug, input.returnTo) : null,
  });
}

/** Restores the staff identity (generated or the real developer) that opened student view. */
export async function returnToStaff(input: { runId: string; expectedRevision: number; commandId: string }): Promise<PreviewResult> {
  const context = await activeContext();
  if (!context) return fail("unavailable");
  const { config, db, claims, control } = context;
  if (!control || !control.live || control.run_id !== input.runId) return fail("inactive");
  if (!claims || !sessionOfControl(control, claims)) return fail("session_mismatch");
  const inStudentView = control.current_logical_id !== null && STUDENT_ID.test(control.current_logical_id);
  // Outside student view only a replay of the completed return (from its student session) is accepted.
  if (!inStudentView && claims.session_id !== control.replay_session_id) return fail("invalid_request");
  const result = await performSwitch({
    config, control, claims, db, kind: "return", target: control.prior_logical_id, commandId: input.commandId,
    expectedRevision: input.expectedRevision,
  });
  const directory = control.prior_return_path ?? staffAcademyPath(control.academy_slug, "/students");
  return result.ok ? { ...result, destination: platformOrigin("staff") + directory } : result;
}

/**
 * Ends the control: generated sessions lose authority at once, the real developer session is restored
 * through the SSR cookie adapter, and issued sessions are revoked. If the original session cannot be
 * restored, the browser is signed out and sent to the normal login.
 */
export async function exitPreview(): Promise<PreviewResult> {
  const context = await activeContext();
  const cookieStore = await cookies();
  if (!context?.control) {
    cookieStore.set(controlCookie("", 0));
    return { ok: true, destination: platformOrigin("staff") + "/" };
  }
  const { config, db, claims, control } = context;
  await rpc(config, "dev_control_end", { p_control_id: control.id, p_reason: "exit" });
  let restored = claims?.session_id === control.original_session_id && claims.sub === control.developer_id;
  if (!restored) {
    try {
      const stored = JSON.parse(open(config.key, await rpc<string>(config, "dev_control_original", { p_control_id: control.id }), originalContext(config, control))) as Pair;
      const { data, error } = await db.auth.setSession(stored);
      restored = !error && data.session?.user.id === control.developer_id;
    } catch {
      restored = false;
    }
  }
  if (!restored) await db.auth.signOut({ scope: "local" }).catch(() => {});
  const revoked = await revokeIssued(config, control, []);
  cookieStore.set(controlCookie("", 0));
  if (!restored) return fail("original_unavailable", `${platformOrigin("staff")}/auth/login`);
  // An unrevoked issued session has no authority after the control ended; revocation is retried on sign-out.
  void revoked;
  return { ok: true, destination: platformOrigin("staff") + control.return_path };
}

/**
 * Real sign-out while previewing: ends the control and revokes its issued sessions and the preserved
 * original session. The caller continues with the existing sign-out cleanup. Returns false when some
 * provider revocation must be retried; the ended control already denies generated-account authority.
 */
export async function endPreviewForSignOut(): Promise<boolean> {
  const config = developmentConfig();
  if (!config) return true;
  const control = await readControl(config).catch(() => null);
  if (!control) return true;
  await rpc(config, "dev_control_end", { p_control_id: control.id, p_reason: "sign_out" });
  let ok = await revokeIssued(config, control, []);
  try {
    const stored = JSON.parse(open(config.key, await rpc<string>(config, "dev_control_original", { p_control_id: control.id }), originalContext(config, control))) as Pair;
    await revokeSession(config, stored, "global");
  } catch {
    ok = false;
  }
  return ok;
}

export function clearedControlCookie() {
  return controlCookie("", 0);
}
