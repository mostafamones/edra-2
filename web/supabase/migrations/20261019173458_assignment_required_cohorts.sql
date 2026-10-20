-- Task 4 / G06. Required history and current placement eligibility are distinct.
-- Existing stored recipients are preserved verbatim as the migrated required cohort, including
-- valid empty cohorts. Incomplete group preparation without any target remains uninitialized.
-- New captures/reset revisions keep their audience and membership provenance permanently.
-- recipient_count remains the captured REQUIRED count (including subsequently ended requirements),
-- never the number of current candidates or lazily created optional work aggregates.

alter table public.assignments add column cohort_revision integer not null default 0 check (cohort_revision >= 0);
create table public.assignment_cohorts (
  assignment_id uuid not null references public.assignments(id),
  revision integer not null check (revision > 0),
  audience_basis jsonb not null check (jsonb_typeof(audience_basis) = 'object'),
  source text not null check (source in ('existing_recipients', 'first_audience', 'audience_reset')),
  captured_at timestamptz not null default clock_timestamp(),
  captured_by uuid references public.profiles(id),
  primary key (assignment_id, revision)
);
create table public.assignment_cohort_members (
  assignment_id uuid not null,
  cohort_revision integer not null,
  annual_student_record_id uuid not null references public.annual_student_records(id),
  requirement_ended_at timestamptz,
  primary key (assignment_id, cohort_revision, annual_student_record_id),
  foreign key (assignment_id, cohort_revision) references public.assignment_cohorts(assignment_id, revision)
);
create index assignment_cohort_members_student_idx on public.assignment_cohort_members(annual_student_record_id, assignment_id)
  where requirement_ended_at is null;
alter table public.assignment_cohorts enable row level security;
alter table public.assignment_cohort_members enable row level security;
revoke all on public.assignment_cohorts, public.assignment_cohort_members from public, anon, authenticated;

create or replace function edra_private.assignment_audience_basis(p_target public.assignments)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('audience',p_target.audience,'level_id',p_target.level_id,'track_id',p_target.track_id,
    'group_ids',coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.assignment_audience_groups g
      where g.assignment_id=p_target.id),'[]'::jsonb));
$$;

-- Placement matching deliberately ignores delivery state: physical work still uses its separate
-- ready/open-year/submission checks; independent online suspension does not block staff marking.
create or replace function edra_private.assignment_matches_record(p_target public.assignments, p_record public.annual_student_records)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_record.academy_id=p_target.academy_id and p_record.academic_year_id=p_target.academic_year_id
    and p_record.archived_at is null and case p_target.audience
      when 'level' then p_record.level_id=p_target.level_id
      when 'program' then p_record.level_id=p_target.level_id and p_record.track_id=p_target.track_id
      when 'groups' then exists(select 1 from public.assignment_audience_groups g where g.assignment_id=p_target.id and g.group_id=p_record.primary_group_id)
    end,false);
$$;

-- Existing membership is historical fact, never reconstructed from today's placement. Kept as
-- a restricted migration helper so the actual transition can be regression-tested on legacy rows.
create or replace function edra_private.backfill_assignment_cohorts()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.assignments a where a.cohort_revision=0 order by a.id for update;
  insert into public.assignment_cohorts(assignment_id,revision,audience_basis,source)
  select a.id,1,edra_private.assignment_audience_basis(a),'existing_recipients' from public.assignments a
  where a.cohort_revision=0 and (a.audience<>'groups'
    or exists(select 1 from public.assignment_audience_groups g where g.assignment_id=a.id)
    or exists(select 1 from public.assignment_recipients x where x.assignment_id=a.id))
  on conflict do nothing;
  insert into public.assignment_cohort_members(assignment_id,cohort_revision,annual_student_record_id)
  select x.assignment_id,1,x.annual_student_record_id from public.assignment_recipients x
  join public.assignment_cohorts c on c.assignment_id=x.assignment_id and c.revision=1
  join public.assignments a on a.id=x.assignment_id and a.cohort_revision=0
  on conflict do nothing;
  update public.assignments a set cohort_revision=1,
    recipient_count=(select count(*) from public.assignment_cohort_members m where m.assignment_id=a.id and m.cohort_revision=1)
  where a.cohort_revision=0 and exists(select 1 from public.assignment_cohorts c where c.assignment_id=a.id and c.revision=1);
end;
$$;
revoke all on function edra_private.backfill_assignment_cohorts() from public,anon,authenticated;
select edra_private.backfill_assignment_cohorts();

create or replace function edra_private.snapshot_assignment_recipients(p_target public.assignments)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
  basis jsonb;
  previous jsonb;
  next_revision integer;
  total integer;
begin
  select a.* into target from public.assignments a where a.id=p_target.id for update;
  basis:=edra_private.assignment_audience_basis(target);
  if target.cohort_revision>0 then
    select c.audience_basis into previous from public.assignment_cohorts c
    where c.assignment_id=target.id and c.revision=target.cohort_revision;
    -- Includes an established empty cohort. Cosmetic group order/title/text edits do nothing.
    if previous=basis then return target.recipient_count; end if;
    if edra_private.assignment_has_activity(target.id) then raise exception 'structure_locked'; end if;
  end if;
  if target.audience='groups' and jsonb_array_length(basis->'group_ids')=0 then return target.recipient_count; end if;
  next_revision:=target.cohort_revision+1;
  insert into public.assignment_cohorts(assignment_id,revision,audience_basis,source,captured_by)
  values(target.id,next_revision,basis,case when target.cohort_revision=0 then 'first_audience' else 'audience_reset' end,auth.uid());
  -- Record locks serialize capture with placement exits. Concurrent new enrollment is either in
  -- this statement's committed matching set or becomes optional; routine saves never recapture it.
  insert into public.assignment_cohort_members(assignment_id,cohort_revision,annual_student_record_id)
  select target.id,next_revision,r.id from public.annual_student_records r
  where r.academy_id=target.academy_id and r.academic_year_id=target.academic_year_id
    and edra_private.assignment_matches_record(target,r)
  order by r.id for share of r;
  -- Only an authorized pre-activity audience reset reaches here; prior membership stays in history.
  delete from public.assignment_recipients x where x.assignment_id=target.id and not exists(
    select 1 from public.assignment_cohort_members m where m.assignment_id=target.id
      and m.cohort_revision=next_revision and m.annual_student_record_id=x.annual_student_record_id);
  insert into public.assignment_recipients(assignment_id,annual_student_record_id,academy_id,academic_year_id)
  select target.id,m.annual_student_record_id,target.academy_id,target.academic_year_id
  from public.assignment_cohort_members m where m.assignment_id=target.id and m.cohort_revision=next_revision
  on conflict do nothing;
  select count(*) into total from public.assignment_cohort_members m where m.assignment_id=target.id and m.cohort_revision=next_revision;
  update public.assignments set cohort_revision=next_revision,recipient_count=total where id=target.id;
  return total;
end;
$$;

-- Read-only candidate/work relation. Unsaved late students have version 1, matching the existing
-- optimistic command contract. No read creates requirements, work, marks or result events.
create or replace function edra_private.assignment_roster(p_assignment_id uuid)
returns setof public.assignment_recipients language sql stable security definer set search_path = '' as $$
  select x.* from public.assignment_recipients x where x.assignment_id=p_assignment_id
  union all
  select (jsonb_populate_record(null::public.assignment_recipients,jsonb_build_object(
    'assignment_id',a.id,'annual_student_record_id',r.id,'academy_id',a.academy_id,'academic_year_id',a.academic_year_id,
    'created_at',null,'work_status','expected','work_note','','feedback','','version',1,'published_revision',0))).*
  from public.assignments a join public.annual_student_records r
    on r.academy_id=a.academy_id and r.academic_year_id=a.academic_year_id
  where a.id=p_assignment_id and edra_private.assignment_matches_record(a,r)
    and not exists(select 1 from public.assignment_recipients x where x.assignment_id=a.id and x.annual_student_record_id=r.id);
$$;

-- Caller already holds assignment then year. Record locks serialize with staff placement commands;
-- no placement writer takes an assignment/recipient lock in reverse. New optional aggregates never
-- alter recipient_count or cohort membership.
create or replace function edra_private.ensure_assignment_recipient(p_target public.assignments,p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.annual_student_records%rowtype;
begin
  select s.* into r from public.annual_student_records s where s.id=p_record_id
    and s.academy_id=p_target.academy_id and s.academic_year_id=p_target.academic_year_id for share;
  if not found then raise exception 'not_recipient'; end if;
  if not exists(select 1 from public.assignment_recipients x where x.assignment_id=p_target.id and x.annual_student_record_id=r.id) then
    if p_target.state<>'active' then raise exception 'assignment_closed'; end if;
    if not edra_private.assignment_matches_record(p_target,r) then raise exception 'not_recipient'; end if;
    insert into public.assignment_recipients(assignment_id,annual_student_record_id,academy_id,academic_year_id)
    values(p_target.id,r.id,p_target.academy_id,p_target.academic_year_id) on conflict do nothing;
  end if;
end;
$$;

create or replace function edra_private.require_assignment_placement(p_target public.assignments,p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.annual_student_records r where r.id=p_record_id
    and r.academy_id=p_target.academy_id and r.academic_year_id=p_target.academic_year_id
    and edra_private.assignment_matches_record(p_target,r)) then raise exception 'not_recipient'; end if;
end;
$$;

-- A targeted set update, not per-assignment work on ordinary roster reads. The annual row lock is
-- held before this trigger; first-work commands hold that row before writing their recipient.
-- Preserve received work and every private/official result. Returning to the audience never
-- reinstates an ended requirement; it may allow optional work under the normal gates.
create or replace function edra_private.end_assignment_requirements_on_placement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.assignment_cohort_members m set requirement_ended_at=clock_timestamp()
  from public.assignments a,public.assignment_recipients x
  where m.annual_student_record_id=new.id and m.requirement_ended_at is null
    and a.id=m.assignment_id and a.cohort_revision=m.cohort_revision
    and a.academy_id=new.academy_id and a.academic_year_id=new.academic_year_id
    and x.assignment_id=m.assignment_id and x.annual_student_record_id=new.id
    and x.work_status not in ('submitted','late') and x.published_revision=0
    and not edra_private.assignment_matches_record(a,new);
  return null;
end;
$$;
create trigger annual_students_end_assignment_requirements
  after update of level_id,track_id,primary_group_id on public.annual_student_records
  for each row when ((old.level_id,old.track_id,old.primary_group_id) is distinct from (new.level_id,new.track_id,new.primary_group_id))
  execute function edra_private.end_assignment_requirements_on_placement();

create or replace function edra_private.guard_assignment_cohort_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and tg_table_name='assignment_cohort_members' then
    if (new.assignment_id,new.cohort_revision,new.annual_student_record_id) is not distinct from
        (old.assignment_id,old.cohort_revision,old.annual_student_record_id)
    and old.requirement_ended_at is null and new.requirement_ended_at is not null then return new; end if;
  end if;
  raise exception 'history_immutable';
end;
$$;
create trigger assignment_cohorts_immutable before update or delete on public.assignment_cohorts
  for each row execute function edra_private.guard_assignment_cohort_history();
create trigger assignment_cohort_members_preserve_history before update or delete on public.assignment_cohort_members
  for each row execute function edra_private.guard_assignment_cohort_history();

comment on column public.assignments.recipient_count is 'Captured required cohort count, including ended requirements. Optional eligibility/work does not change this denominator.';
comment on column public.assignments.cohort_revision is 'Zero means no valid audience established. Each deliberate pre-work audience change captures a new immutable cohort revision.';

revoke all on function edra_private.assignment_audience_basis(public.assignments),
  edra_private.assignment_matches_record(public.assignments,public.annual_student_records),
  edra_private.snapshot_assignment_recipients(public.assignments),edra_private.assignment_roster(uuid),
  edra_private.ensure_assignment_recipient(public.assignments,uuid),edra_private.require_assignment_placement(public.assignments,uuid),
  edra_private.end_assignment_requirements_on_placement(),edra_private.guard_assignment_cohort_history()
from public,anon,authenticated;

-- Additive projection helpers are kept separate from Task 3's scoring/result projections.
create or replace function edra_private.assignment_cohort_context(p_assignment_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cohort_revision',a.cohort_revision,
    'cohort',case when c.revision is null then null else jsonb_build_object('revision',c.revision,
      'source',c.source,'captured_at',c.captured_at,'audience_basis',c.audience_basis) end,
    'current_required_count',(select count(*) from public.assignment_cohort_members m where m.assignment_id=a.id
      and m.cohort_revision=a.cohort_revision and m.requirement_ended_at is null),
    'eligible_count',(select count(*) from public.annual_student_records r
      where r.academy_id=a.academy_id and r.academic_year_id=a.academic_year_id
        and edra_private.assignment_matches_record(a,r)),
    'optional_eligible_count',(select count(*) from public.annual_student_records r
      where r.academy_id=a.academy_id and r.academic_year_id=a.academic_year_id
        and edra_private.assignment_matches_record(a,r)
        and not exists(select 1 from public.assignment_cohort_members m where m.assignment_id=a.id
          and m.cohort_revision=a.cohort_revision and m.annual_student_record_id=r.id and m.requirement_ended_at is null))
  ) from public.assignments a left join public.assignment_cohorts c on c.assignment_id=a.id and c.revision=a.cohort_revision
  where a.id=p_assignment_id;
$$;

create or replace function edra_private.assignment_recipient_context(p_assignment_id uuid,p_record_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('required',m.annual_student_record_id is not null,
    'requirement_ended_at',m.requirement_ended_at,
    'requirement_source',case when m.annual_student_record_id is null then 'late_eligibility' else 'required_cohort' end,
    'cohort_revision',m.cohort_revision,
    'eligible',edra_private.assignment_matches_record(a,r))
  from public.assignments a join public.annual_student_records r
    on r.id=p_record_id and r.academy_id=a.academy_id and r.academic_year_id=a.academic_year_id
  left join public.assignment_cohort_members m on m.assignment_id=a.id and m.cohort_revision=a.cohort_revision and m.annual_student_record_id=r.id
  where a.id=p_assignment_id;
$$;
revoke all on function edra_private.assignment_cohort_context(uuid),edra_private.assignment_recipient_context(uuid,uuid)
  from public,anon,authenticated;

-- Compose with the current scoring definitions, including Task 3 when installed. Migration order
-- places this slice after 20261019172557. No scoring, correction, result-content or hash logic is copied.
alter function edra_private.assignment_json(uuid) rename to assignment_json_before_cohorts;
create function edra_private.assignment_json(p_assignment_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select edra_private.assignment_json_before_cohorts(p_assignment_id) || edra_private.assignment_cohort_context(p_assignment_id);
$$;

alter function edra_private.assignment_recipient_rows(uuid,uuid) rename to assignment_recipient_rows_before_cohorts;
create function edra_private.assignment_recipient_rows(p_assignment_id uuid,p_record_id uuid)
returns table(record_id uuid,sort_name text,item jsonb)
language sql stable security definer set search_path = '' as $$
  select b.record_id,b.sort_name,b.item || edra_private.assignment_recipient_context(p_assignment_id,b.record_id)
  from edra_private.assignment_recipient_rows_before_cohorts(p_assignment_id,p_record_id) b
  union all
  select r.id,lower(r.full_name),jsonb_build_object(
    'annual_student_record_id',r.id,'full_name',r.full_name,'archived',false,
    'group_name',g.name,'student_code',c.code,'work_status','expected','received_at',null,
    'work_note','','work_recorded_at',null,'feedback','','version',1,'updated_at',null,
    'marks','[]'::jsonb,'answers','[]'::jsonb,'marked_parts',0,'total',null,'marking','unmarked',
    'publication',null,'publication_state','unpublished') || edra_private.assignment_recipient_context(a.id,r.id)
  from public.assignments a join public.annual_student_records r on r.academy_id=a.academy_id and r.academic_year_id=a.academic_year_id
  left join public.groups g on g.id=r.primary_group_id
  left join public.student_code_assignments c on c.annual_student_record_id=r.id and c.retired_at is null
  where a.id=p_assignment_id and (p_record_id is null or r.id=p_record_id)
    and edra_private.assignment_matches_record(a,r)
    and not exists(select 1 from public.assignment_recipients x where x.assignment_id=a.id and x.annual_student_record_id=r.id);
$$;

-- These wrappers add only allocation and first-work eligibility. The prior commands own validation,
-- scoring, versions, receipts and official history. Existing receipts go directly to that command
-- for its exact fingerprint validation, even after a later placement change or year closure.
alter function edra_private.save_assignment_marks(uuid,uuid,uuid,text,integer,jsonb,uuid,uuid)
  rename to save_assignment_marks_before_cohorts;
create function edra_private.save_assignment_marks(
  p_academy_id uuid,p_assignment_id uuid,p_record_id uuid,p_code text,p_expected_version integer,p_changes jsonb,p_key uuid,
  p_expected_record_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
  recipient public.assignment_recipients%rowtype;
  record_id uuid;
  first_work boolean:=false;
begin
  perform edra_private.require_assignment_role(p_academy_id,false);
  if exists(select 1 from public.assignment_requests q where q.actor_id=auth.uid() and q.idempotency_key=p_key) then
    return edra_private.save_assignment_marks_before_cohorts(p_academy_id,p_assignment_id,p_record_id,p_code,p_expected_version,p_changes,p_key,p_expected_record_id);
  end if;
  if p_code is not null then perform 1 from public.student_code_settings c where c.academy_id=p_academy_id for share; end if;
  target:=edra_private.lock_assignment_for_marking(p_academy_id,p_assignment_id);
  record_id:=coalesce(p_record_id,edra_private.resolve_assignment_code(target,p_code));
  perform edra_private.require_open_assignment_year(target.academy_id,target.academic_year_id);
  perform edra_private.ensure_assignment_recipient(target,record_id);
  select x.* into recipient from public.assignment_recipients x where x.assignment_id=target.id and x.annual_student_record_id=record_id for update;
  if recipient.version=p_expected_version and recipient.work_status not in ('submitted','late') then
    if jsonb_typeof(p_changes->'answers')='array' then first_work:=jsonb_array_length(p_changes->'answers')>0; end if;
    if jsonb_typeof(p_changes->'marks')='array' then
      first_work:=first_work or exists(select 1 from jsonb_array_elements(p_changes->'marks') m
        where coalesce(m->'score','null'::jsonb)<>'null'::jsonb and not m ? 'excused_reason');
    end if;
    if first_work then perform edra_private.require_assignment_placement(target,record_id); end if;
  end if;
  return edra_private.save_assignment_marks_before_cohorts(p_academy_id,p_assignment_id,p_record_id,p_code,p_expected_version,p_changes,p_key,p_expected_record_id);
end;
$$;

alter function edra_private.record_assignment_work(uuid,uuid,uuid,integer,public.assignment_work_status,timestamptz,text)
  rename to record_assignment_work_before_cohorts;
create function edra_private.record_assignment_work(
  p_academy_id uuid,p_assignment_id uuid,p_record_id uuid,p_expected_version integer,
  p_status public.assignment_work_status,p_received_at timestamptz,p_note text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.assignments%rowtype; recipient public.assignment_recipients%rowtype;
begin
  perform edra_private.require_assignment_role(p_academy_id,false);
  target:=edra_private.lock_assignment_for_marking(p_academy_id,p_assignment_id);
  perform edra_private.require_open_assignment_year(target.academy_id,target.academic_year_id);
  perform edra_private.ensure_assignment_recipient(target,p_record_id);
  select x.* into recipient from public.assignment_recipients x where x.assignment_id=target.id and x.annual_student_record_id=p_record_id for update;
  if recipient.version=p_expected_version and recipient.work_status not in ('submitted','late') and p_status in ('submitted','late') then
    perform edra_private.require_assignment_placement(target,p_record_id);
  end if;
  return edra_private.record_assignment_work_before_cohorts(p_academy_id,p_assignment_id,p_record_id,p_expected_version,p_status,p_received_at,p_note);
end;
$$;

revoke all on function edra_private.assignment_json(uuid),edra_private.assignment_recipient_rows(uuid,uuid),
 edra_private.save_assignment_marks(uuid,uuid,uuid,text,integer,jsonb,uuid,uuid),
 edra_private.record_assignment_work(uuid,uuid,uuid,integer,public.assignment_work_status,timestamptz,text)
from public,anon,authenticated;
create or replace function public.list_assignment_recipients(p_academy_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.assignments a where a.id = p_assignment_id and a.academy_id = p_academy_id) then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'annual_student_record_id', r.id, 'full_name', r.full_name, 'archived', r.archived_at is not null,
      'level_id', r.level_id, 'track_id', r.track_id, 'group_name', g.name, 'student_code', c.code
    ) || edra_private.assignment_recipient_context(x.assignment_id,r.id) order by lower(r.full_name), r.id)
    from edra_private.assignment_roster(p_assignment_id) x
    join public.annual_student_records r on r.id = x.annual_student_record_id and r.academy_id = x.academy_id
    left join public.groups g on g.id = r.primary_group_id
    left join public.student_code_assignments c on c.annual_student_record_id = r.id and c.retired_at is null
    where x.assignment_id = p_assignment_id and x.academy_id = p_academy_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_filter text default 'all', p_limit integer default 1000, p_offset integer default 0,
  p_search text default null
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  needle text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  code_needle text := public.normalize_student_code(p_search);
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.assignments a where a.id = p_assignment_id and a.academy_id = p_academy_id) then return null; end if;
  if p_filter is null or p_filter <> all (array['all', 'not_received', 'needs_marking', 'marked', 'unpublished'])
    or p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset < 0 or length(coalesce(p_search, '')) > 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with filtered as (
    select r.record_id, r.sort_name, r.item from edra_private.assignment_recipient_rows(p_assignment_id, null) r
    where case p_filter
      when 'all' then true
      when 'not_received' then (r.item->>'required')::boolean and r.item->>'requirement_ended_at' is null and r.item->>'work_status' in ('expected', 'missing')
      when 'needs_marking' then r.item->>'work_status' in ('submitted', 'late') and r.item->>'marking' <> 'complete'
      when 'marked' then r.item->>'marking' = 'complete'
      when 'unpublished' then r.item->>'marking' = 'complete' and r.item->>'publication_state' <> 'published'
    end
    and (needle is null
      or strpos(r.sort_name, needle) > 0
      or (code_needle is not null and starts_with(coalesce(r.item->>'student_code', ''), code_needle)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(page.item order by page.sort_name, page.record_id)
      from (select f.* from filtered f order by f.sort_name, f.record_id limit p_limit offset p_offset) page
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function edra_private.resolve_assignment_code(p_target public.assignments, p_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := public.normalize_student_code(p_code);
  codes_on boolean;
  holders integer;
  code_row public.student_code_assignments%rowtype;
  holder public.annual_student_records%rowtype;
begin
  if normalized is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select s.enabled into codes_on from public.student_code_settings s where s.academy_id = p_target.academy_id;
  if not coalesce(codes_on, false) then raise exception using errcode = 'P0001', message = 'student_codes_disabled'; end if;

  select count(distinct a.academy_student_profile_id) into holders from public.student_code_assignments a
  where a.academy_id = p_target.academy_id and a.code = normalized;
  if holders = 0 then raise exception using errcode = 'P0001', message = 'student_code_not_found'; end if;
  if holders > 1 then raise exception using errcode = 'P0001', message = 'student_code_ambiguous'; end if;

  select a.* into code_row from public.student_code_assignments a
  where a.academy_id = p_target.academy_id and a.code = normalized and a.retired_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'student_code_retired'; end if;

  select r.* into holder from public.annual_student_records r
  where r.id = code_row.annual_student_record_id and r.academy_id = p_target.academy_id for share;
  select a.* into code_row from public.student_code_assignments a where a.id = code_row.id;
  if not found or code_row.retired_at is not null or holder.id is null
    or holder.archived_at is not null or holder.level_id <> code_row.level_id
    or holder.academic_year_id <> code_row.academic_year_id then
    raise exception using errcode = 'P0001', message = 'student_code_retired';
  end if;
  if holder.academic_year_id <> p_target.academic_year_id
    or (not exists (select 1 from public.assignment_recipients x where x.assignment_id = p_target.id and x.annual_student_record_id = holder.id)
      and not edra_private.assignment_matches_record(p_target,holder)) then
    raise exception using errcode = 'P0001', message = 'not_recipient';
  end if;
  return holder.id;
end;
$$;

