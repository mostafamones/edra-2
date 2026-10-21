#!/usr/bin/env node
// Manual isolated-cloud check of Developer mode HTTP endpoints (enter, switch, return, exit, RLS, sign-out).
// Runs only against the isolated project msnjxvnblgkdeigctbhk. Never run it against the shared development project.
// Usage: node scripts/dev-academy/preview-check.mjs ~/.edra-dev/ci-next.env
// Also requires EDRA_PREVIEW_DEVELOPER_PHONE and EDRA_PREVIEW_DEVELOPER_PASSWORD_FILE in the shell. Secrets are never printed.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";

const ISOLATED_URL = "https://msnjxvnblgkdeigctbhk.supabase.co";
const CONTROL = "edra-dev-control";
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_EDRA_APP_ORIGIN",
  "NEXT_PUBLIC_EDRA_LEARN_ORIGIN", "SUPABASE_SERVICE_ROLE_KEY", "EDRA_PREVIEW_DEVELOPER_PHONE",
  "EDRA_PREVIEW_DEVELOPER_PASSWORD_FILE",
];

function parseEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const v = m[2];
    out[m[1]] = /^('.*'|".*")$/.test(v) ? v.slice(1, -1) : v;
  }
  return out;
}

if (!process.argv[2]) throw new Error("usage: preview-check.mjs <env-file>");
const env = { ...process.env, ...parseEnvFile(process.argv[2].replace(/^~(?=\/)/, homedir())) };
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error(`missing env: ${missing.join(", ")}`);
  process.exit(1);
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== ISOLATED_URL) {
  console.error("refusing: NEXT_PUBLIC_SUPABASE_URL is not the isolated project");
  process.exit(1);
}

const URL_ = ISOLATED_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = env.NEXT_PUBLIC_EDRA_APP_ORIGIN.replace(/\/$/, "");
const LEARN = env.NEXT_PUBLIC_EDRA_LEARN_ORIGIN.replace(/\/$/, "");
const PHONE = env.EDRA_PREVIEW_DEVELOPER_PHONE;
const PASSWORD = readFileSync(env.EDRA_PREVIEW_DEVELOPER_PASSWORD_FILE.replace(/^~(?=\/)/, homedir()), "utf8").trim();

const redact = (s) => String(s).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>").slice(0, 300);
const expect = (cond, detail) => { if (!cond) throw new Error(detail); };
const want = (r, status) => {
  if (r.status !== status) throw new Error(`HTTP ${r.status} (want ${status}): ${redact(r.text)}`);
  return r.json;
};

/** Cookie jar that applies Set-Cookie headers; Max-Age=0 or empty value deletes. */
class Jar {
  map = new Map();
  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join("; "); }
  apply(res) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";").map((s) => s.trim());
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "" || attrs.some((a) => /^max-age=0$/i.test(a))) this.map.delete(name);
      else this.map.set(name, value);
    }
  }
}

async function call(jar, path, { body, origin = APP, form = false } = {}) {
  const headers = { Cookie: jar.header() };
  if (origin) headers.Origin = origin;
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  else if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${APP}${path}`, {
    method: body === undefined && !form ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  jar.apply(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, json, text, res };
}

const serverClient = (jar) => createServerClient(URL_, PUB, {
  cookieOptions: { name: "edra-auth-v1", domain: "lvh.me", path: "/", sameSite: "lax", secure: false },
  cookies: {
    getAll: () => [...jar.map].map(([name, value]) => ({ name, value })),
    setAll: (list) => { for (const { name, value } of list) { if (value) jar.map.set(name, value); else jar.map.delete(name); } },
  },
});

async function signIn() {
  const jar = new Jar();
  const { error } = await serverClient(jar).auth.signInWithPassword({ phone: PHONE, password: PASSWORD });
  if (error) throw new Error(`sign-in failed: status ${error.status ?? "?"}`);
  return jar;
}

async function access(jar) {
  const { data } = await serverClient(jar).auth.getSession();
  if (!data.session) throw new Error("no session in jar");
  return data.session.access_token;
}

const claims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

async function rpc(token, fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: PUB, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, json, text };
}

/** Role string, null, or "401" when the session has no authority. */
async function roleOf(token, academy) {
  const r = await rpc(token, "academy_role_for", { target_academy_id: academy });
  if (r.status === 401) return "401";
  if (r.status !== 200) throw new Error(`academy_role_for HTTP ${r.status}: ${redact(r.text)}`);
  return r.json;
}
const noAuthority = async (token) => ["401", null].includes(await roleOf(token, ACADEMY));

const failures = [];
async function check(name, fn) {
  try {
    const note = await fn();
    console.log(`PASS ${name}${note ? ` (${note})` : ""}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

let RUN;
let SLUG;
let ACADEMY;
const uuid = () => randomUUID();
const status = async (jar) => want(await call(jar, "/api/development/status"), 200);
const enter = (jar, studentLogicalId, returnTo) =>
  call(jar, "/api/development/enter", { body: { runId: RUN, studentLogicalId, returnTo } });
const sw = (jar, logicalId, expectedRevision, commandId, returnTo = null) =>
  call(jar, "/api/development/switch", { body: { runId: RUN, logicalId, expectedRevision, commandId, returnTo } });
const ret = (jar, expectedRevision, commandId) =>
  call(jar, "/api/development/return", { body: { runId: RUN, expectedRevision, commandId } });
const exit = (jar) => call(jar, "/api/development/exit", { body: { runId: RUN } });
const staffRole = (st, role) => st.staffTargets.filter((t) => t.role === role);

async function main() {
  let dev;
  let devTok;
  let devSid;
  let devSub;
  let inst;
  let enterCookie = "";
  let st;

  await check("developer sign-in", async () => {
    dev = await signIn();
    devTok = await access(dev);
    devSid = claims(devTok).session_id;
    devSub = claims(devTok).sub;
    return `session present: ${Boolean(devTok)}`;
  });
  if (!dev) {
    console.log("ABORT: developer sign-in failed; remaining checks skipped");
    process.exitCode = 1;
    return;
  }

  await check("A1 status without cookies", async () => {
    const j = want(await call(new Jar(), "/api/development/status"), 200);
    expect(j.available === false, `body ${redact(JSON.stringify(j))}`);
  });

  await check("A1 status with developer session", async () => {
    st = await status(dev);
    expect(st.available === true && st.active === false && st.run?.id && st.run?.academySlug,
      `body keys ${Object.keys(st)}`);
    expect(st.students?.length === 20 && st.students.every((s) => s.recordId && s.logicalId), "inactive status lists 20 generated students");
    RUN = st.run.id;
    SLUG = st.run.academySlug;
    return `slug ${SLUG}`;
  });

  await check("academy lookup (service role)", async () => {
    const res = await fetch(`${URL_}/rest/v1/academies?slug=eq.${encodeURIComponent(SLUG)}&select=id`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    const rows = await res.json();
    expect(res.status === 200 && rows.length === 1, `HTTP ${res.status} rows ${Array.isArray(rows) ? rows.length : "?"}`);
    ACADEMY = rows[0].id;
  });

  await check("A4 enter without Origin is 403", async () => {
    const r = await call(dev, "/api/development/enter", { body: { runId: RUN, studentLogicalId: null, returnTo: "/" }, origin: null });
    want(r, 403);
  });

  await check("A4 enter with evil Origin is 403", async () => {
    const r = await call(dev, "/api/development/enter", { body: { runId: RUN, studentLogicalId: null, returnTo: "/" }, origin: "http://evil.example" });
    want(r, 403);
  });

  await check("A4 enter with valid Origin and bad runId is 400", async () => {
    const r = await call(dev, "/api/development/enter", { body: { runId: "not-a-uuid", studentLogicalId: null, returnTo: null } });
    want(r, 400);
  });

  await check("enter as owner (200, revision 1)", async () => {
    const r = await enter(dev, null, "/");
    const j = want(r, 200);
    enterCookie = r.res.headers.getSetCookie().find((c) => c.startsWith(`${CONTROL}=`)) ?? "";
    expect(j.ok === true && j.destination === `${APP}/${SLUG}` && j.revision === 1, `body ${redact(JSON.stringify(j))}`);
  });

  await check("enter control cookie attributes", async () => {
    const raw = enterCookie;
    const ok = /;\s*httponly/i.test(raw) && /;\s*samesite=lax/i.test(raw) && /;\s*domain=lvh\.me/i.test(raw);
    expect(ok && dev.map.has(CONTROL), `cookie present ${Boolean(raw)} attrs ok ${ok}`);
  });

  await check("status after owner enter", async () => {
    st = await status(dev);
    const instructors = staffRole(st, "instructor");
    expect(st.active === true && st.current.role === "owner" && st.staffTargets.length === 6, `active ${st.active} role ${st.current?.role} targets ${st.staffTargets?.length}`);
    expect(instructors.length === 3 && new Set(instructors.map((t) => t.displayName)).size === 3, `instructors ${instructors.length}`);
    expect(st.students.length === 20 && st.revision === 1, `students ${st.students.length} revision ${st.revision}`);
    inst = instructors[0].logicalId;
  });

  await check("nested enter is 409", async () => {
    const j = want(await enter(dev, null, "/"), 409);
    expect(j.error === "nested", `error ${j.error}`);
  });

  let genTok;
  await check("A2 RLS owner role and original developer role", async () => {
    genTok = await access(dev);
    const owner = await roleOf(genTok, ACADEMY);
    const original = await roleOf(devTok, ACADEMY);
    expect(owner === "owner" && original === "instructor", `owner ${owner} original ${original}`);
  });

  let instTok;
  await check("switch to instructor (200, revision 2)", async () => {
    const j = want(await sw(dev, inst, 1, uuid()), 200);
    expect(j.ok === true && j.revision === 2, `body ${redact(JSON.stringify(j))}`);
    instTok = await access(dev);
    expect(await roleOf(instTok, ACADEMY) === "instructor", "current role not instructor");
    expect(await noAuthority(genTok), "superseded owner token still has authority");
  });

  await check("A5 replay keeps revision and session", async () => {
    const c1 = uuid();
    const { revision } = await status(dev);
    const first = want(await sw(dev, inst, revision, c1), 200);
    const before = claims(await access(dev)).session_id;
    const j = want(await sw(dev, inst, revision, c1), 200);
    expect(j.revision === first.revision && j.revision === revision + 1, `replay revision ${j.revision}`);
    const after = claims(await access(dev)).session_id;
    expect(before === after, "session changed on replay");
  });

  await check("A5 new commandId with stale revision is 409", async () => {
    const j = want(await sw(dev, inst, 1, uuid()), 409);
    expect(j.ok === false, `error ${j.error}`);
    return `error ${j.error}`;
  });

  await check("student switch (200, learn destination, list_my_exams)", async () => {
    const r = await sw(dev, "account:student:01", (await status(dev)).revision, uuid(), `/${SLUG}/students?q=a&evil=1&page=1`);
    const j = want(r, 200);
    expect(j.ok === true && j.destination.startsWith(LEARN), `destination ${j.destination}`);
    st = await status(dev);
    expect(st.current.kind === "student" && st.priorStaff?.logicalId === inst, `kind ${st.current.kind} prior ${st.priorStaff?.logicalId}`);
    const exams = await rpc(await access(dev), "list_my_exams", { p_academy_id: ACADEMY, p_limit: 10, p_offset: 0 });
    const items = Array.isArray(exams.json) ? exams.json : exams.json?.items;
    expect(exams.status === 200 && Array.isArray(items) && items.length >= 1, `HTTP ${exams.status} items ${items?.length}`);
    return `items ${items.length}`;
  });

  await check("second student keeps priorStaff", async () => {
    want(await sw(dev, "account:student:02", (await status(dev)).revision, uuid()), 200);
    st = await status(dev);
    expect(st.priorStaff?.logicalId === inst, `prior ${st.priorStaff?.logicalId}`);
  });

  await check("return to staff (sanitized destination)", async () => {
    const j = want(await ret(dev, (await status(dev)).revision, uuid()), 200);
    expect(j.destination === `${APP}/${SLUG}/students?q=a&page=1`, `destination ${j.destination}`);
    st = await status(dev);
    expect(st.current.logicalId === inst, `current ${st.current.logicalId}`);
  });

  await check("exit (developer original restored, control cleared)", async () => {
    const instTok2 = await access(dev);
    const j = want(await exit(dev), 200);
    expect(j.destination === `${APP}/`, `destination ${j.destination}`);
    expect(!dev.map.has(CONTROL), "control cookie still present");
    expect(claims(await access(dev)).sub === devSub && claims(await access(dev)).session_id === devSid, "not original session");
    expect((await status(dev)).active === false, "still active");
    expect(await noAuthority(instTok2), "exited instructor token still has authority");
  });

  await check("direct student entry and return to original", async () => {
    const e = want(await enter(dev, "account:student:03", `/${SLUG}/students?status=all`), 200);
    expect(e.destination.startsWith(LEARN), `destination ${e.destination}`);
    expect((await status(dev)).priorStaff?.kind === "original", "priorStaff not original");
    const r = want(await ret(dev, e.revision, uuid()), 200);
    expect(r.destination === `${APP}/${SLUG}/students?status=all`, `destination ${r.destination}`);
    const s = await status(dev);
    expect(s.current.kind === "original", `kind ${s.current.kind}`);
    expect(claims(await access(dev)).session_id === devSid, "session is not developer original");
    expect(await roleOf(await access(dev), ACADEMY) === "instructor", "original role not instructor");
    want(await exit(dev), 200);
  });

  await check("A4 tampered control cookie is 410 inactive", async () => {
    want(await enter(dev, null, "/"), 200);
    const { revision } = await status(dev);
    const real = dev.map.get(CONTROL);
    dev.map.set(CONTROL, randomBytes(32).toString("base64url"));
    try {
      expect((await status(dev)).active !== true, "status active with tampered control");
      const j = want(await sw(dev, inst, revision, uuid()), 410);
      expect(j.error === "inactive", `error ${j.error}`);
    } finally {
      dev.map.set(CONTROL, real);
      want(await exit(dev), 200);
    }
  });

  await check("A6 sign-out revokes generated and original sessions", async () => {
    want(await enter(dev, null, "/"), 200);
    const genAfterEnter = await access(dev);
    const r = await call(dev, "/auth/signout", { form: true });
    expect(r.status === 303 && (r.res.headers.get("location") ?? "").includes("/auth/login"), `HTTP ${r.status} location ${r.res.headers.get("location")}`);
    expect(await noAuthority(genAfterEnter), "generated token still has authority");
    expect(await noAuthority(devTok), "developer original token still has authority");
    expect((await status(new Jar())).available === false, "status available without cookies");
  });

  await check("invalid target is 400 invalid_target", async () => {
    dev = await signIn();
    const { run } = await status(dev);
    expect(run?.id === RUN, "run id changed");
    want(await enter(dev, null, "/"), 200);
    const { revision } = await status(dev);
    const j = want(await sw(dev, "account:staff:nobody", revision, uuid()), 400);
    expect(j.error === "invalid_target", `error ${j.error}`);
    want(await exit(dev), 200);
  });

  console.log(`\n${failures.length ? "FAILED" : "ALL CHECKS PASSED"}: ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.log(`FAIL harness: ${redact(e.message)}`);
  process.exitCode = 1;
});
