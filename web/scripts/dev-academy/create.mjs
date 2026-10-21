// `create`: registers a run, reserves its contacts, provisions random-password Auth accounts through the
// Admin API, loads the domain records in one transaction and marks the run ready after baseline
// verification. Retries resume the same run's accounts only; nothing is deleted automatically.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { jsonLiteral } from "./connection.mjs";
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

function loadSql(ctx) {
  return `begin;
select set_config('edra.dev_run', '${ctx.runId}', true);
create temp table fx on commit drop as select ${jsonLiteral({
    lockToken: ctx.lockToken, scenarioHash: ctx.hash, academySlug: ctx.slug, scenario: ctx.scenario,
  })} as doc;
${readFileSync(join(HERE, "sql/load.sql"), "utf8")}
commit;`;
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
  if (!(await one(ctx.runSql, lockRunSql(ctx.runId, ctx.lockToken)))) {
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
    await ctx.runSql(loadSql(ctx));
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
