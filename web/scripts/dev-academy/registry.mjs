// Private registry SQL for dev-academy cloud commands. Every interpolated value is either validated
// here (UUIDs, enums) or passed as a dollar-quoted literal.
import { createHash } from "node:crypto";

import { jsonLiteral, sqlLiteral } from "./connection.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const STATES = new Set(["planned", "provisioning", "loading", "ready", "failed", "resetting", "auth_cleanup_pending", "reset"]);

export function uuid(value, name = "UUID") {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${name} must be a lowercase UUID.`);
  return value;
}

/** Auth user ID of a run's generated account, fixed before creation so a retry adopts only that account. */
export function plannedUserId(runId, logicalId) {
  const hex = createHash("md5").update(`${uuid(runId)}:account:${logicalId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const scenarioHash = (scenario) => createHash("sha256").update(JSON.stringify(scenario)).digest("hex");

/** The generated accounts and reserved contacts a scenario needs. */
export function scenarioAccounts(scenario, runId) {
  const people = [...scenario.staff.filter((person) => !person.placeholder), ...scenario.students];
  return people.map((person) => ({
    logicalId: person.accountKey,
    kind: person.pattern ? "student" : person.role,
    displayName: person.displayName,
    phone: person.phone,
    parentPhone: person.parentPhone ?? null,
    userId: plannedUserId(runId, person.accountKey),
  }));
}

/** Schema readiness and the real developer's identity; read-only. */
export function preflightSql(developerId) {
  return `select jsonb_build_object(
    'registry', to_regclass('edra_private.dev_runs') is not null,
    'migrations', (select coalesce(jsonb_agg(name), '[]'::jsonb) from supabase_migrations.schema_migrations),
    'developer_auth', exists (select 1 from auth.users u where u.id = '${uuid(developerId, "Developer ID")}'),
    'developer_profile', exists (select 1 from public.profiles p where p.id = '${developerId}'),
    'developer_generated', exists (select 1 from edra_private.dev_accounts a where a.user_id = '${developerId}')
  ) as result;`;
}

/** Registers the run if new and returns its row; existing rows are never overwritten. */
export function registerRunSql(run) {
  return `insert into edra_private.dev_runs (id, project_ref, recipe_version, seed, reference_date, student_count, scenario_hash, developer_id)
  values ('${uuid(run.id)}', ${sqlLiteral(run.projectRef)}, ${sqlLiteral(run.recipeVersion)}, ${sqlLiteral(run.seed)},
    ${sqlLiteral(run.referenceDate)}::date, ${Number(run.students)}, ${sqlLiteral(run.scenarioHash)}, '${uuid(run.developerId)}')
  on conflict (id) do nothing;
  select to_jsonb(r) - 'lock_token' as result from edra_private.dev_runs r where r.id = '${run.id}';`;
}

/** Takes the per-run lock when it is free or expired; returns the row only to the winner. */
export function lockRunSql(runId, token, minutes = 5) {
  return `update edra_private.dev_runs set lock_token = '${uuid(token)}', lock_expires_at = now() + interval '${Number(minutes)} minutes',
    state = case when state in ('planned', 'failed') then 'provisioning' else state end, updated_at = now()
  where id = '${uuid(runId)}' and state in ('planned', 'provisioning', 'loading', 'failed')
    and (lock_token is null or lock_expires_at <= now())
  returning jsonb_build_object('state', state) as result;`;
}

const locked = (runId, token) => `id = '${uuid(runId)}' and lock_token = '${uuid(token)}' and lock_expires_at > now()`;

export function setStateSql(runId, token, state, { errorStage = null, errorDetail = null, release = false } = {}) {
  if (!STATES.has(state)) throw new Error("Unknown run state.");
  return `update edra_private.dev_runs set state = '${state}', updated_at = now(),
    error_stage = ${errorStage ? sqlLiteral(errorStage) : "null"}, error_detail = ${errorDetail ? sqlLiteral(errorDetail) : "null"},
    ready_at = ${state === "ready" ? "now()" : "ready_at"}
    ${release ? ", lock_token = null, lock_expires_at = null" : ""}
  where ${locked(runId, token)}
  returning jsonb_build_object('state', state) as result;`;
}

/**
 * Reserves every contact and account row before any Auth operation. Aborts on any collision with an
 * existing Auth identity, profile, student/parent contact or another run; this run's own planned
 * accounts are the only identities a retry may find.
 */
export function reserveSql(runId, token, accounts, developerId) {
  const contacts = accounts.flatMap((a) => [
    { phone: a.phone, logicalId: a.logicalId, purpose: "login" },
    ...(a.parentPhone ? [{ phone: a.parentPhone, logicalId: a.logicalId, purpose: "parent" }] : []),
  ]);
  return `do $$
declare
  conflicts integer;
begin
  perform 1 from edra_private.dev_runs where ${locked(runId, token)} for update;
  if not found then raise exception 'dev-academy: run lock was lost'; end if;
  create temp table fx_contacts on commit drop as
  select c->>'phone' as phone, c->>'logicalId' as logical_id, c->>'purpose' as purpose
  from jsonb_array_elements(${jsonLiteral(contacts)}) c;
  create temp table fx_accounts on commit drop as
  select a->>'logicalId' as logical_id, a->>'kind' as kind, a->>'displayName' as display_name, a->>'phone' as phone,
    (a->>'userId')::uuid as user_id
  from jsonb_array_elements(${jsonLiteral(accounts)}) a;
  if (select count(distinct phone) from fx_contacts) <> (select count(*) from fx_contacts) then
    raise exception 'dev-academy: scenario contacts are not unique';
  end if;

  select count(*) into conflicts from fx_contacts c where
    exists (select 1 from auth.users u where ltrim(u.phone, '+') = ltrim(c.phone, '+')
      and u.id is distinct from (select a.user_id from fx_accounts a where a.logical_id = c.logical_id and c.purpose = 'login'))
    or exists (select 1 from public.profiles p where ltrim(p.phone, '+') = ltrim(c.phone, '+')
      and p.id is distinct from (select a.user_id from fx_accounts a where a.logical_id = c.logical_id and c.purpose = 'login'))
    or exists (select 1 from public.annual_student_records r where c.phone in (r.student_phone, r.parent_phone)
      and r.academy_id is distinct from (select academy_id from edra_private.dev_runs where id = '${runId}'))
    or exists (select 1 from public.student_profiles s where s.parent_phone = c.phone
      and s.user_id is distinct from (select a.user_id from fx_accounts a where a.logical_id = c.logical_id))
    or exists (select 1 from public.account_contact_changes x where x.new_phone = c.phone)
    or exists (select 1 from edra_private.dev_contacts d where d.phone = c.phone
      and (d.run_id <> '${runId}' or d.logical_id <> c.logical_id or d.purpose <> c.purpose));
  if conflicts > 0 then
    raise exception 'dev-academy: % synthetic contact(s) collide with existing identities; nothing was overwritten', conflicts;
  end if;
  if exists (select 1 from edra_private.dev_accounts d join fx_accounts a on a.logical_id = d.logical_id
      where d.run_id = '${runId}' and (d.user_id is distinct from a.user_id or d.phone <> a.phone or d.kind <> a.kind))
    or exists (select 1 from fx_accounts a where a.user_id = '${uuid(developerId)}') then
    raise exception 'dev-academy: registered accounts differ from the scenario';
  end if;

  insert into edra_private.dev_developers (user_id) values ('${developerId}') on conflict do nothing;
  insert into edra_private.dev_contacts (phone, run_id, logical_id, purpose)
  select phone, '${runId}', logical_id, purpose from fx_contacts on conflict (phone) do nothing;
  insert into edra_private.dev_accounts (run_id, logical_id, kind, display_name, phone, user_id)
  select '${runId}', logical_id, kind, display_name, phone, user_id from fx_accounts on conflict (run_id, logical_id) do nothing;
end;
$$;
select jsonb_agg(jsonb_build_object('logical_id', logical_id, 'user_id', user_id, 'state', state,
  'credential', credential_ciphertext) order by logical_id) as result
from edra_private.dev_accounts where run_id = '${runId}';`;
}

/** Stores a sealed credential once; a concurrent writer's earlier value wins. */
export function storeCredentialSql(runId, token, logicalId, ciphertext) {
  return `update edra_private.dev_accounts a set credential_ciphertext = ${sqlLiteral(ciphertext)}, updated_at = now()
  from edra_private.dev_runs r
  where r.${locked(runId, token)} and a.run_id = r.id and a.logical_id = ${sqlLiteral(logicalId)}
    and a.state = 'reserved' and a.credential_ciphertext is null;
  select credential_ciphertext as result from edra_private.dev_accounts
  where run_id = '${runId}' and logical_id = ${sqlLiteral(logicalId)};`;
}

export function markCreatedSql(runId, token, logicalId) {
  return `update edra_private.dev_accounts a set state = 'created', updated_at = now()
  from edra_private.dev_runs r
  where r.${locked(runId, token)} and a.run_id = r.id and a.logical_id = ${sqlLiteral(logicalId)} and a.state = 'reserved'
  returning a.state as result;`;
}

export function runRowSql(runId) {
  return `select to_jsonb(r) - 'lock_token' as result from edra_private.dev_runs r where r.id = '${uuid(runId)}';`;
}
