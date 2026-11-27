// Emit a rollback-only integration fixture for db-ci.sh's disposable GitHub runner database.
// This script does not connect anywhere and needs no credentials or npm dependencies.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildScenario } from "./scenario.mjs";
import { jsonLiteral } from "./connection.mjs";
import { scenarioAccounts, scenarioHash } from "./registry.mjs";
import { expectedCounts } from "./verify.mjs";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
  throw new Error("Development academy database fixture is restricted to the disposable GitHub Actions database job.");
}
const recipe = process.argv[2];
if (!["edra-dev-v3", "edra-dev-v4", "edra-dev-v5", "edra-dev-v6"].includes(recipe)) throw new Error("Specify a supported fixture recipe.");
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo" }).format(new Date());
const year = Number(today.slice(0, 4)) - (today.slice(5) < "08-16" ? 1 : 0);
const scenario = buildScenario({ recipeVersion: recipe, referenceDate: `${year}-11-27` });
const runId = "d0e50000-0000-4000-8000-000000000001";
const developerId = "d0e50000-0000-4000-8000-000000000002";
const lockToken = "d0e50000-0000-4000-8000-000000000003";
const accounts = scenarioAccounts(scenario, runId);
const readSql = (name) => readFileSync(fileURLToPath(new URL(`./sql/${name}.sql`, import.meta.url)), "utf8");
const verify = readSql("verify").replace("with run as (", "create temp table fixture_report on commit drop as\nwith run as (");

process.stdout.write(`begin;
select set_config('edra.dev_run', '${runId}', true);
insert into auth.users (id, raw_user_meta_data) values ('${developerId}', '{"full_name":"Fixture Developer"}');
insert into edra_private.dev_developers (user_id) values ('${developerId}');
create temp table fixture_accounts on commit drop as select value as account from jsonb_array_elements(${jsonLiteral(accounts)});
insert into auth.users (id, phone, raw_user_meta_data)
select (account->>'userId')::uuid, ltrim(account->>'phone', '+'), jsonb_build_object('full_name', account->>'displayName')
from fixture_accounts;
create temp table fx on commit drop as select ${jsonLiteral({ lockToken, scenarioHash: scenarioHash(scenario), academySlug: "edra-fixture", scenario })} as doc;
insert into edra_private.dev_runs (id, project_ref, recipe_version, seed, reference_date, student_count, scenario_hash,
  developer_id, state, lock_token, lock_expires_at)
select '${runId}', 'abcdefghijklmnopqrst', doc->'scenario'->'config'->>'recipeVersion', doc->'scenario'->'config'->>'seed',
  (doc->'scenario'->'config'->>'referenceDate')::date, (doc->'scenario'->'config'->>'studentCount')::integer,
  doc->>'scenarioHash', '${developerId}', 'loading', '${lockToken}', now() + interval '30 minutes' from fx;
insert into edra_private.dev_contacts (phone, run_id, logical_id, purpose)
select account->>'phone', '${runId}', account->>'logicalId', 'login' from fixture_accounts
union all select account->>'parentPhone', '${runId}', account->>'logicalId', 'parent'
from fixture_accounts where account->>'parentPhone' is not null;
insert into edra_private.dev_accounts (run_id, logical_id, kind, display_name, phone, user_id, credential_ciphertext, state)
select '${runId}', account->>'logicalId', account->>'kind', account->>'displayName', account->>'phone',
  (account->>'userId')::uuid, 'fixture-only-unused-credential', 'created' from fixture_accounts;
${readSql("load")}
${verify}
do $assert$
declare report jsonb := (select result from fixture_report); expected jsonb := ${jsonLiteral(expectedCounts(scenario))};
  entry record; result_row jsonb; student_record uuid; content jsonb; expected_complete boolean;
begin
  if report->'failures' <> '[]'::jsonb or report->'baseline_failures' <> '[]'::jsonb then
    raise exception 'development fixture verification failed: %, %', report->'failures', report->'baseline_failures';
  end if;
  for entry in select * from jsonb_each(expected) loop
    if report->'counts'->entry.key is distinct from entry.value then
      raise exception 'development fixture %: expected %, got %', entry.key, entry.value, report->'counts'->entry.key;
    end if;
  end loop;
  for result_row in select value from fx cross join lateral jsonb_array_elements(doc->'scenario'->'examResults')
    where value->>'receivedAt' is not null loop
    select record_id into strict student_record from fx_students where sid = result_row->>'studentId';
    content := edra_private.exam_result_content(pg_temp.rid(result_row->>'examId'), student_record);
    expected_complete := result_row->>'state' in ('announced', 'marked_private');
    if content is null or (content->>'complete')::boolean is distinct from expected_complete
      or (result_row->>'total' is not null and (content->>'total')::numeric <> (result_row->>'total')::numeric) then
      raise exception 'development fixture exam scoring differs from scenario';
    end if;
  end loop;
  for result_row in select value from fx cross join lateral jsonb_array_elements(doc->'scenario'->'assignmentResults')
    where value->>'state' in ('announced','late_announced') loop
    select record_id into strict student_record from fx_students where sid = result_row->>'studentId';
    if not exists (select 1 from public.assignment_result_publications p
      where p.assignment_id = pg_temp.rid(result_row->>'assignmentId') and p.annual_student_record_id = student_record
        and p.total = (result_row->>'total')::numeric) then
      raise exception 'development fixture assignment publication differs from scenario';
    end if;
  end loop;
  if report->'counts'->'effects' <> report->'counts'->'effects_suppressed' then
    raise exception 'development fixture effect suppression is incomplete';
  end if;
  if (report->'projections'->'staff'->>'past_sessions')::integer <> least(${scenario.sessions.length},100)
    or jsonb_array_length(report->'projections'->'student'->'my_exams'->'items') = 0 then
    raise exception 'development fixture staff/student projections are incomplete';
  end if;
end;
$assert$;
rollback;
`);
