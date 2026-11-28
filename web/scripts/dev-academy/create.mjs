// `create`: registers a run, reserves its contacts, provisions random-password Auth accounts through the
// Admin API, loads the domain records in one transaction and marks the run ready after baseline
// verification. Retries resume the same run's accounts only; nothing is deleted automatically.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { sqlLiteral } from "./connection.mjs";
import { decryptSecret, encryptSecret, randomPassword } from "./credentials.mjs";
import {
  lockRunSql, markCreatedSql, preflightSql, registerRunSql, reserveSql, scenarioAccounts, setStateSql, storeCredentialSql,
} from "./registry.mjs";
import { verifyRun } from "./verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const one = async (runSql, sql) => (await runSql(sql))[0]?.result;

/** Every repository migration must be applied (by name: older shared-project versions were renumbered). */
export function missingMigrations(applied, files) {
  const names = new Set(applied);
  return files.map((file) => file.match(/^\d+_(.+)\.sql$/)?.[1]).filter((name) => name && !names.has(name));
}

/**
 * Standard Webhooks signature, as Supabase Auth signs Send SMS hook calls. Used only for the no-send
 * probe below; the hook secret never leaves this process.
 */
export function signHook(secrets, id, timestamp, body) {
  const secret = secrets.split("|")[0].trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  const signature = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${signature}` };
}

/**
 * Hosted check that the deployed Send SMS hook refuses a reserved synthetic recipient before any
 * logging or delivery. The code is a non-secret placeholder and the expected result sends nothing.
 */
export async function probeDeliveryGuard(target, hookSecret, account, fetcher = fetch) {
  if (!hookSecret) throw new Error("SEND_SMS_HOOK_SECRET is required to verify the deployed delivery guard.");
  const body = JSON.stringify({
    user: { id: account.userId, phone: account.phone.slice(1), user_metadata: {} },
    sms: { otp: "000000", phone: account.phone.slice(1) },
  });
  const response = await fetcher(`${target.url}/functions/v1/send-whatsapp-auth`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signHook(hookSecret, `msg_${randomUUID()}`, Math.floor(Date.now() / 1000), body) },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  if (result?.error?.http_code !== 403) {
    throw new Error(`Deployed delivery guard did not refuse a synthetic recipient (HTTP ${response.status}). Provisioning stopped.`);
  }
}

async function provision(ctx, accounts) {
  const admin = createClient(ctx.target.url, ctx.target.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const states = new Map((ctx.reserved ?? []).map((row) => [row.logical_id, row]));
  for (const account of accounts) {
    const registered = states.get(account.logicalId);
    if (registered?.state !== "reserved") continue;
    const context = { purpose: "account-password", projectRef: ctx.target.projectRef, runId: ctx.runId, userId: account.userId };
    const sealed = await one(ctx.runSql, storeCredentialSql(ctx.runId, ctx.lockToken, account.logicalId, encryptSecret(ctx.key, randomPassword(), context)));
    if (!sealed) throw new Error(`Credential for ${account.logicalId} was not stored.`);
    const password = decryptSecret(ctx.key, sealed, context);

    const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(account.userId);
    if (existing?.user) {
      // Only this run's pre-registered ID can be adopted, and only with its reserved phone.
      if (existing.user.phone?.replace(/^\+/, "") !== account.phone.slice(1)) throw new Error(`${account.logicalId} exists with another phone.`);
    } else {
      if (lookupError && lookupError.status !== 404) throw new Error(`Auth lookup failed for ${account.logicalId} (${lookupError.status ?? "error"}).`);
      const { error } = await admin.auth.admin.createUser({
        id: account.userId, phone: account.phone, password, phone_confirm: true,
        user_metadata: { full_name: account.displayName },
      });
      if (error) throw new Error(`Auth createUser failed for ${account.logicalId} (${error.code ?? error.status ?? "error"}).`);
    }
    if (!(await one(ctx.runSql, markCreatedSql(ctx.runId, ctx.lockToken, account.logicalId)))) {
      throw new Error(`Run lock was lost while provisioning ${account.logicalId}.`);
    }
  }
}

// The SQL API refuses large request bodies (a 300-student scenario is ~7 MB), so the load document is staged
// in pieces of at most this many UTF-16 units and reassembled inside the one load transaction.
export const LOAD_PART_CHARS = 256_000;

/** Splits text into ordered pieces without cutting a surrogate pair. */
export function splitParts(text, size = LOAD_PART_CHARS) {
  const parts = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

// Staging writes succeed only for the lock holder of a run in the loading state.
const loadingLock = (ctx) => `select 1 from edra_private.dev_runs where id = '${ctx.runId}' and state = 'loading'
    and lock_token = '${ctx.lockToken}' and lock_expires_at > now()`;

export function clearPartsSql(ctx) {
  return `with gate as (${loadingLock(ctx)}), cleared as (
  delete from edra_private.dev_load_parts where run_id = '${ctx.runId}' and exists (select 1 from gate) returning 1)
select jsonb_build_object('locked', exists (select 1 from gate), 'cleared', (select count(*) from cleared)) as result;`;
}

export function stagePartSql(ctx, seq, part) {
  return `insert into edra_private.dev_load_parts (run_id, seq, part)
select '${ctx.runId}', ${Number(seq)}, ${sqlLiteral(part)} where exists (${loadingLock(ctx)})
returning jsonb_build_object('seq', seq) as result;`;
}

export function loadDocument(ctx) {
  return JSON.stringify({ lockToken: ctx.lockToken, scenarioHash: ctx.hash, academySlug: ctx.slug, scenario: ctx.scenario });
}

/** One transaction: reassemble exactly `count` staged pieces, load, then delete the pieces. */
export function loadSql(ctx, count) {
  return `begin;
select set_config('edra.dev_run', '${ctx.runId}', true);
do $$ begin
  if (select count(*) <> ${Number(count)} or coalesce(max(seq), -1) <> ${Number(count) - 1}
      from edra_private.dev_load_parts where run_id = '${ctx.runId}') then
    raise exception 'dev-academy: staged load document is incomplete';
  end if;
end $$;
create temp table fx on commit drop as
  select string_agg(part, '' order by seq)::jsonb as doc from edra_private.dev_load_parts where run_id = '${ctx.runId}';
${readFileSync(join(HERE, "sql/load.sql"), "utf8")}
delete from edra_private.dev_load_parts where run_id = '${ctx.runId}';
commit;`;
}

async function load(ctx) {
  const cleared = await one(ctx.runSql, clearPartsSql(ctx));
  if (!cleared?.locked) throw new Error("Run lock was lost before loading.");
  const parts = splitParts(loadDocument(ctx), ctx.partChars);
  for (const [seq, part] of parts.entries()) {
    if (!(await one(ctx.runSql, stagePartSql(ctx, seq, part)))) throw new Error(`Run lock was lost while staging part ${seq}.`);
  }
  await ctx.runSql(loadSql(ctx, parts.length));
}

/** Runs create for a validated configuration; returns the verification report of the ready run. */
export async function createRun(ctx, log = console.log) {
  const preflight = await one(ctx.runSql, preflightSql(ctx.developerId));
  if (!preflight?.registry) throw new Error("Development tooling migrations are not applied to this project.");
  const missing = missingMigrations(preflight.migrations, ctx.migrationFiles);
  if (missing.length) throw new Error(`Project is missing repository migrations: ${missing.join(", ")}.`);
  if (!preflight.developer_auth || !preflight.developer_profile) throw new Error("Developer UUID is not an existing user of this project.");
  if (preflight.developer_generated) throw new Error("Developer UUID belongs to a generated account.");

  const run = await one(ctx.runSql, registerRunSql({
    id: ctx.runId, projectRef: ctx.target.projectRef, recipeVersion: ctx.scenario.config.recipeVersion, seed: ctx.scenario.config.seed,
    referenceDate: ctx.scenario.config.referenceDate, students: ctx.scenario.config.studentCount, scenarioHash: ctx.hash,
    developerId: ctx.developerId,
  }));
  const same = run.project_ref === ctx.target.projectRef && run.scenario_hash === ctx.hash && run.developer_id === ctx.developerId
    && run.seed === ctx.scenario.config.seed && run.reference_date === ctx.scenario.config.referenceDate;
  if (!same) throw new Error("Run already exists with a different configuration; resume requires identical inputs.");
  if (run.state === "ready") throw new Error("Run is already ready; use inspect or verify instead of create.");
  if (!(await one(ctx.runSql, lockRunSql(ctx.runId, ctx.lockToken, ctx.scenario.config.studentCount > 20 ? 30 : 5)))) {
    throw new Error(`Run cannot be locked (state ${run.state}, or another create holds the lock).`);
  }

  let stage = "reserve";
  try {
    const accounts = scenarioAccounts(ctx.scenario, ctx.runId);
    ctx.reserved = await one(ctx.runSql, reserveSql(ctx.runId, ctx.lockToken, accounts, ctx.developerId));
    stage = "delivery-guard";
    if (ctx.probe) await ctx.probe(accounts.find((a) => a.kind === "student"));
    stage = "provision";
    await provision(ctx, accounts);
    stage = "load";
    await one(ctx.runSql, setStateSql(ctx.runId, ctx.lockToken, "loading"));
    await load(ctx);
    stage = "verify";
    const report = await verifyRun(ctx, "baseline");
    if (!report.ok) throw new Error(`Baseline verification failed: ${report.problems.join("; ")}`);
    await one(ctx.runSql, setStateSql(ctx.runId, ctx.lockToken, "ready", { release: true }));
    log(`Run ${ctx.runId} is ready.`);
    return report;
  } catch (error) {
    const detail = String(error.message).slice(0, 500);
    await ctx.runSql(setStateSql(ctx.runId, ctx.lockToken, "failed", { errorStage: stage, errorDetail: detail, release: true })).catch(() => {});
    throw new Error(`at ${stage}: ${detail}`);
  }
}
