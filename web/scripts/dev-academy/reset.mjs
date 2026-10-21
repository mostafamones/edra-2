// Read-only reset dry-run for one registered run. impactSql is a single SELECT; nothing here writes.
// Counts use query_to_xml() over format()-built SELECTs, so dynamic per-table counts stay read-only.
import { createHash } from "node:crypto";

import { uuid } from "./registry.mjs";

const RESETTABLE = ["ready", "failed"];
// Each entry: [report field, refusal text]; a refusal applies when the count is above zero.
const COUNT_REFUSALS = [
  ["outside_memberships", "generated accounts belong to other academies"],
  ["outside_student_profiles", "generated students participate in other academies"],
  ["foreign_student_links", "real accounts are linked as students in this academy"],
  ["foreign_staff", "unexpected real staff in this academy"],
  ["storage_objects", "storage objects reference this academy"],
  ["active_controls", "developer preview controls are active"],
];
// active_controls is left out so ending a preview does not change the reviewed impact hash.
const HASHED = [
  "run", "academy", "schema_version", "scoped_tables", "child_tables", "user_tables", "accounts",
  "outside_memberships", "outside_student_profiles", "foreign_student_links", "foreign_staff", "storage_objects",
];

// Single-quoted SQL text for a query nested inside a format() call.
const text = (sql) => `'${sql.replaceAll("'", "''")}'`;
// Row count of a format()-built query, read back through query_to_xml.
const countOf = (sql, args) => `(xpath('/row/c/text()', query_to_xml(format(${text(sql)}, ${args}), false, true, '')))[1]::text::bigint`;

export function impactSql(runId) {
  const id = uuid(runId, "Run ID");
  const gen = `select user_id from edra_private.dev_accounts where run_id = '${id}' and user_id is not null`;
  const academy = "(select academy_id from r)";
  const scopedCount = countOf("select count(*) as c from public.%I where academy_id = %L", `s.name, ${academy}`);
  const columnList = (relation, attnums) => `(select string_agg(quote_ident(a.attname), ', ' order by k.n) from unnest(${attnums}) with ordinality k(attnum, n)
    join pg_attribute a on a.attrelid = ${relation} and a.attnum = k.attnum)`;
  const childCount = countOf(
    "select count(*) as c from public.%I where (%s) in (select %s from public.%I where academy_id = %L)",
    `f.child, ${columnList("f.conrelid", "f.conkey")}, ${columnList("f.confrelid", "f.confkey")}, f.ref, ${academy}`,
  );
  const userCount = countOf(`select count(*) as c from public.%I where user_id in (${gen})`, "p.name");
  const tableNames = (condition) => `select t.table_name::text as name from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and ${condition}`;
  const hasColumn = (name) => `exists (select 1 from information_schema.columns c where c.table_schema = 'public'
    and c.table_name = t.table_name and c.column_name = '${name}')`;

  return `with r as (select * from edra_private.dev_runs where id = '${id}'),
gen as (${gen}),
scoped as (${tableNames(hasColumn("academy_id"))}),
plain as (${tableNames(`not ${hasColumn("academy_id")}`)}),
user_plain as (select p.name from plain p where exists (select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p.name and c.column_name = 'user_id')),
fks as (
  select k.conrelid, k.conkey, k.confrelid, k.confkey, cl.relname::text as child, rf.relname::text as ref
  from pg_constraint k
  join pg_class cl on cl.oid = k.conrelid
  join pg_class rf on rf.oid = k.confrelid
  where k.contype = 'f' and cl.relnamespace = 'public'::regnamespace and rf.relnamespace = 'public'::regnamespace
    and cl.relname::text in (select name from plain) and rf.relname::text in (select name from scoped)
),
child_list as (
  select f.child as tbl,
    (select string_agg(a.attname::text, ', ' order by k.n) from unnest(f.conkey) with ordinality k(attnum, n)
      join pg_attribute a on a.attrelid = f.conrelid and a.attnum = k.attnum) as col,
    f.ref as target,
    ${childCount} as n
  from fks f
)
select jsonb_build_object(
  'run', (select jsonb_build_object('id', r.id, 'state', r.state, 'project_ref', r.project_ref,
    'academy_id', r.academy_id, 'developer_id', r.developer_id) from r),
  'academy', (select jsonb_build_object('id', a.id, 'slug', a.slug) from public.academies a, r where a.id = r.academy_id),
  'schema_version', (select max(version) from supabase_migrations.schema_migrations),
  'scoped_tables', (select coalesce(jsonb_agg(jsonb_build_object('table', s.name, 'rows', ${scopedCount}) order by s.name), '[]'::jsonb)
    from scoped s),
  'child_tables', (select coalesce(jsonb_agg(jsonb_build_object('table', c.tbl, 'column', c.col, 'references', c.target,
    'rows', c.n) order by c.tbl, c.col), '[]'::jsonb) from child_list c),
  'user_tables', (select coalesce(jsonb_agg(u.x order by u.x->>'table'), '[]'::jsonb) from (
    select jsonb_build_object('table', p.name, 'rows', ${userCount}) as x from user_plain p
    union all
    select jsonb_build_object('table', 'profiles', 'rows', (select count(*) from public.profiles where id in (select user_id from gen)))
  ) u),
  'accounts', (select coalesce(jsonb_agg(jsonb_build_object('logical_id', a.logical_id, 'kind', a.kind, 'user_id', a.user_id,
    'state', a.state, 'phone', left(a.phone, 4) || '******' || right(a.phone, 2)) order by a.logical_id), '[]'::jsonb)
    from edra_private.dev_accounts a where a.run_id = '${id}'),
  'outside_memberships', (select count(*) from public.academy_memberships m
    where m.user_id in (select user_id from gen) and m.academy_id is distinct from ${academy}),
  'outside_student_profiles', (select count(*) from public.academy_student_profiles p
    where p.user_id in (select user_id from gen) and p.academy_id is distinct from ${academy}),
  'foreign_student_links', (select count(*) from public.academy_student_profiles p
    where p.academy_id = ${academy} and p.user_id is not null and p.user_id not in (select user_id from gen)),
  'foreign_staff', (select count(*) from public.academy_memberships m, r
    where m.academy_id = r.academy_id and m.user_id not in (select user_id from gen) and m.user_id is distinct from r.developer_id),
  'storage_objects', (select count(*) from storage.objects o where position((select academy_id::text from r) in o.name) > 0),
  'active_controls', (select count(*) from edra_private.dev_controls c
    where c.run_id = '${id}' and c.ended_at is null and c.expires_at > now())
) as result;`;
}

/** Human reasons the run cannot be reset; an empty list means the dry-run found nothing blocking. */
export function refusals(report, projectRef) {
  if (!report.run) return ["run is not registered"];
  const reasons = [];
  if (report.run.project_ref !== projectRef) reasons.push(`run belongs to project ${report.run.project_ref}`);
  if (!RESETTABLE.includes(report.run.state)) reasons.push(`run state ${report.run.state} is not resettable`);
  if (!report.run.academy_id) reasons.push("run has no academy");
  for (const [field, message] of COUNT_REFUSALS) {
    if ((report[field] ?? 0) > 0) reasons.push(message);
  }
  // Defensive: the SQL counts every foreign key, so a null count means the query did not return it.
  const uncounted = [...new Set((report.child_tables ?? []).filter((t) => t.rows === null).map((t) => t.table))];
  if (uncounted.length > 0) reasons.push(`foreign key rows could not be counted: ${uncounted.join(", ")}`);
  return reasons;
}

// Sorts object keys recursively so the hash does not depend on key order.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function impactHash(report) {
  const reviewed = Object.fromEntries(HASHED.map((key) => [key, report[key] ?? null]));
  return createHash("sha256").update(JSON.stringify(canonical(reviewed))).digest("hex");
}

/** Runs the impact SELECT once and returns the report, refusal reasons and reviewed hash. */
export async function resetDryRun({ runSql, runId, projectRef }) {
  const rows = await runSql(impactSql(runId));
  const report = rows[0]?.result ?? {};
  return { report, refusals: refusals(report, projectRef), hash: impactHash(report) };
}
