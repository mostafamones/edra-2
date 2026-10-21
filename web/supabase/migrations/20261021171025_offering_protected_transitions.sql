-- EDRA-129: protected transitions. Deliberately disabled for application callers until the
-- isolated database/concurrency release checks pass. Tests enable this private switch locally
-- in their own transaction; this migration never changes an academy's academic data.
begin;

create table edra_private.offering_release (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into edra_private.offering_release default values;
alter table edra_private.offering_release enable row level security;
revoke all on edra_private.offering_release from public,anon,authenticated,service_role;

alter table public.groups add column retired_track_id uuid references public.academy_tracks(id);
alter table public.content_programs add column original_track_name text;
alter table public.academy_levels add column last_stopped_at timestamptz,
  add column last_stopped_by uuid references public.profiles(id);

-- Lineage permits precisely the duplicate names produced by protected broadening. Ordinary
-- creates, renames and restores also check all lineages under the statement-level write gate.
drop index public.groups_active_name_per_program;
create unique index groups_active_name_per_program on public.groups
  (academy_id,academic_year_id,level_id,coalesce(track_id::text,''),lower(name),coalesce(retired_track_id::text,''))
  where archived_at is null;

create function edra_private.offering_group_write_gate()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform edra_private.offering_gate();
  perform pg_advisory_xact_lock(129,2);
  return null;
end $$;
create trigger offering_group_write_gate before insert or update or delete on public.groups
  for each statement execute function edra_private.offering_group_write_gate();

create function edra_private.guard_group_lineage()
returns trigger language plpgsql security definer set search_path='' as $$
declare broadening boolean:=false;
begin
  if tg_op='UPDATE' then
    broadening:=old.archived_at is null and old.track_id is not null and new.track_id is null
      and new.level_id=old.level_id and new.name=old.name and new.retired_track_id=old.track_id
      and edra_private.offering_transition(old.academy_id,old.level_id,old.track_id,'remove_track');
    if new.retired_track_id is distinct from old.retired_track_id and not broadening then raise exception 'forbidden'; end if;
  elsif new.retired_track_id is not null then raise exception 'forbidden'; end if;
  if not broadening and new.archived_at is null and (tg_op='INSERT'
    or (new.name,new.level_id,new.track_id) is distinct from (old.name,old.level_id,old.track_id)
    or old.archived_at is not null) and exists(
      select 1 from public.groups g where g.id<>new.id and g.academy_id=new.academy_id
        and g.academic_year_id=new.academic_year_id and g.archived_at is null
        and g.level_id=new.level_id and g.track_id is not distinct from new.track_id and lower(g.name)=lower(new.name))
  then raise exception using errcode='23505',message='An active group in this program already uses this name.'; end if;
  return new;
end $$;
create trigger groups_guard_lineage before insert or update on public.groups
  for each row execute function edra_private.guard_group_lineage();

create or replace function public.protect_group_dependencies()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.archived_at is null and edra_private.offering_transition(old.academy_id,old.level_id,old.track_id,'remove_track')
    and old.track_id is not null and new.track_id is null and new.retired_track_id=old.track_id
    and (to_jsonb(new)-array['track_id','retired_track_id','updated_at'])=(to_jsonb(old)-array['track_id','retired_track_id','updated_at'])
  then return new; end if;
  if old.archived_at is null and new.archived_at is not null
    and edra_private.offering_transition(old.academy_id,old.level_id,null,'stop_level')
    and (to_jsonb(new)-array['archived_at','updated_at'])=(to_jsonb(old)-array['archived_at','updated_at'])
  then return new; end if;
  if (new.level_id,new.track_id) is distinct from (old.level_id,old.track_id)
    or (new.archived_at is not null and old.archived_at is null) then
    if exists(select 1 from public.schedules s where s.group_id=old.id) then raise exception 'Group has schedules and cannot change program or be archived'; end if;
    if exists(select 1 from public.annual_student_records r where r.primary_group_id=old.id) then raise exception 'Group has student records and cannot change program or be archived'; end if;
  end if;
  return new;
end $$;

-- Keep immutable assignment cohort provenance while recording the new effective basis separately.
create table edra_private.assignment_offering_basis (
  assignment_id uuid primary key references public.assignments(id),
  cohort_revision integer not null,
  audience_basis jsonb not null
);
alter table edra_private.assignment_offering_basis enable row level security;
revoke all on edra_private.assignment_offering_basis from public,anon,authenticated,service_role;

create function edra_private.assessment_levels(p_kind text,p_id uuid)
returns setof text language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
  if p_kind not in ('assignment','quiz','exam') then raise exception 'validation'; end if;
  execute format('select to_jsonb(a) from public.%I a where id=$1',p_kind||'s') into a using p_id;
  if a->>'audience'='groups' then
    return query execute format('select distinct g.level_id from public.%I x join public.groups g on g.id=x.group_id where x.%I=$1',p_kind||'_audience_groups',p_kind||'_id') using p_id;
  elsif a->>'level_id' is not null then return next a->>'level_id'; end if;
end $$;

create function edra_private.guard_frozen_exam()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.roster_frozen_at is not null and ((new.audience,new.level_id,new.track_id,new.roster_frozen_at,new.roster_frozen_by)
    is distinct from (old.audience,old.level_id,old.track_id,old.roster_frozen_at,old.roster_frozen_by)) then raise exception 'structure_locked'; end if;
  return new;
end $$;
create trigger exams_frozen_identity before update on public.exams for each row execute function edra_private.guard_frozen_exam();
create function edra_private.guard_frozen_exam_groups()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.exams z where z.id=coalesce(new.exam_id,old.exam_id) and z.roster_frozen_at is not null)
  then raise exception 'structure_locked'; end if;
  return coalesce(new,old);
end $$;
create trigger exam_groups_frozen_identity before insert or update or delete on public.exam_audience_groups
  for each row execute function edra_private.guard_frozen_exam_groups();

create function edra_private.retire_offering_track(p_academy uuid,p_level text,p_track uuid)
returns void language plpgsql security definer set search_path='' as $$
declare y uuid; original_name text; at timestamptz:=clock_timestamp(); z record;
begin
  -- The only caller is the authorized command holding EXCLUSIVE (129,1).
  select name into original_name from public.academy_tracks where academy_id=p_academy and level_id=p_level and id=p_track and retired_at is null for update;
  if not found then raise exception 'not_found'; end if;
  if edra_private.offering_dependencies(p_academy,p_level,p_track)='{}'::jsonb and not exists(
    select 1 from edra_private.track_year_labels h join public.academic_years y on y.id=h.academic_year_id
      where h.track_id=p_track and y.closed_at is not null) then
    delete from edra_private.track_year_labels where track_id=p_track;
    delete from public.academy_tracks where academy_id=p_academy and id=p_track;
    return;
  end if;
  select id into y from public.academic_years where academy_id=p_academy and closed_at is null for share;
  insert into edra_private.offering_transitions(transaction_id,academy_id,level_id,track_id,operation)
  values(pg_current_xact_id(),p_academy,p_level,p_track,'remove_track');

  -- Capture the complete audience BEFORE any group or placement broadening, including students
  -- with no work. An explicit timestamp also freezes the empty set. Previously frozen rosters stay.
  for z in select e.id from public.exams e where e.academy_id=p_academy and e.academic_year_id=y
    and e.roster_frozen_at is null and (e.track_id=p_track or exists(
      select 1 from public.exam_audience_groups x join public.groups g on g.id=x.group_id
      where x.exam_id=e.id and g.track_id=p_track and g.archived_at is null)) order by e.id for update
  loop
    insert into edra_private.exam_fixed_roster(exam_id,annual_student_record_id)
    select z.id,r from edra_private.exam_audience_records(z.id) r;
    update public.exams set roster_frozen_at=at,roster_frozen_by=auth.uid(),version=version+1,updated_at=at,updated_by=auth.uid() where id=z.id;
  end loop;

  -- Current content programs retain identity. Released documents, attachments and revisions stay.
  update public.content_units u set version=version+1,updated_at=at from public.content_programs p
    where u.program_id=p.id and p.academy_id=p_academy and p.academic_year_id=y and p.track_id=p_track and u.state<>'archived';
  update public.content_programs set track_id=null,original_track_name=coalesce(original_track_name,original_name)
    where academy_id=p_academy and academic_year_id=y and track_id=p_track;
  -- Only content-owned quiz scope is transitioned. Unattached affected quizzes block the command.
  update public.quizzes q set audience='level',track_id=null,version=version+1,updated_at=at,updated_by=auth.uid()
    where q.academy_id=p_academy and q.academic_year_id=y and q.track_id=p_track and q.archived_at is null
      and exists(select 1 from public.content_assessments ca where ca.kind='quiz' and ca.assessment_id=q.id);
  update public.assignments set audience='level',track_id=null,version=version+1,updated_at=at,updated_by=auth.uid()
    where academy_id=p_academy and academic_year_id=y and track_id=p_track and state='active';
  insert into edra_private.assignment_offering_basis(assignment_id,cohort_revision,audience_basis)
    select a.id,a.cohort_revision,edra_private.assignment_audience_basis(a) from public.assignments a
    where a.academy_id=p_academy and a.academic_year_id=y and a.state='active' and a.audience='level'
      and a.level_id=p_level and a.updated_at=at
    on conflict(assignment_id) do update set cohort_revision=excluded.cohort_revision,audience_basis=excluded.audience_basis;

  update public.schedules s set audience='level',track_id=null,
    original_track_name=coalesce(original_track_name,original_name)
    where s.academy_id=p_academy and s.academic_year_id=y and s.track_id=p_track and s.archived_at is null
      and (s.kind='recurring' or exists(select 1 from public.schedule_sessions m where m.schedule_id=s.id
        and (m.occurs_on+m.starts_at) at time zone 'Africa/Cairo'>at));
  update public.schedules s set original_track_name=coalesce(original_track_name,original_name)
    where s.academy_id=p_academy and s.academic_year_id=y and s.archived_at is null
      and exists(select 1 from public.groups g where g.id=s.group_id and g.track_id=p_track and g.archived_at is null);
  update public.groups set track_id=null,retired_track_id=p_track
    where academy_id=p_academy and academic_year_id=y and track_id=p_track and archived_at is null;
  update public.annual_student_records set track_id=null
    where academy_id=p_academy and academic_year_id=y and track_id=p_track and archived_at is null;
  update public.academy_tracks set retired_at=at,retired_by=auth.uid(),version=version+1
    where id=p_track and academy_id=p_academy;
  delete from edra_private.offering_transitions where transaction_id=pg_current_xact_id() and academy_id=p_academy;
end $$;

create function edra_private.stop_offering_level(p_academy uuid,p_level text,p_change jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare y uuid; z record; a record; impact jsonb; at timestamptz;
begin
  perform 1 from public.academy_levels where academy_id=p_academy and level_id=p_level and stopped_at is null for update;
  if not found then raise exception 'not_found'; end if;
  select id into y from public.academic_years where academy_id=p_academy and closed_at is null for share;
  -- Settle only already-due work through the existing domain logic. A blocked result returns
  -- normally so this legitimate lifecycle work commits; no shutdown changes have happened yet.
  for z in select e.* from public.exams e where e.academy_id=p_academy and e.academic_year_id=y
    and p_level in (select edra_private.assessment_levels('exam',e.id)) order by e.id for update loop
    for a in select annual_student_record_id from public.exam_attempts where exam_id=z.id
      and finalized_at is null and superseded_at is null order by annual_student_record_id loop
      perform edra_private.settle_exam_record(z,a.annual_student_record_id);
    end loop;
    perform edra_private.settle_exam_closure(z.id);
  end loop;
  for z in select q.* from public.quizzes q where q.academy_id=p_academy and q.academic_year_id=y
    and p_level in (select edra_private.assessment_levels('quiz',q.id)) order by q.id for update loop
    for a in select annual_student_record_id from public.quiz_attempts where quiz_id=z.id
      and finalized_at is null and superseded_at is null order by annual_student_record_id loop
      perform edra_private.settle_quiz_record(z,a.annual_student_record_id);
    end loop;
    perform edra_private.settle_quiz_closure(z.id);
  end loop;
  impact:=edra_private.offering_impact(p_academy,p_change);
  if impact->'blockers'<>'{}'::jsonb then return jsonb_build_object('outcome','blocked','preview',impact); end if;
  at:=clock_timestamp();
  insert into edra_private.offering_transitions(transaction_id,academy_id,level_id,operation)
    values(pg_current_xact_id(),p_academy,p_level,'stop_level');
  -- No row in a closed year is selected, and already archived records keep their archive facts.
  update public.schedules s set archived_at=at where s.academy_id=p_academy and s.academic_year_id=y
    and s.archived_at is null and (s.level_id=p_level or exists(select 1 from public.groups g where g.id=s.group_id and g.level_id=p_level));
  update public.annual_student_records set archived_at=at where academy_id=p_academy and academic_year_id=y and level_id=p_level and archived_at is null;
  update public.groups set archived_at=at where academy_id=p_academy and academic_year_id=y and level_id=p_level and archived_at is null;
  update public.assignments a set state='closed',closed_at=at,closed_by=auth.uid(),offering_closed_at=at,
    version=version+1,updated_at=at,updated_by=auth.uid()
    where a.academy_id=p_academy and a.academic_year_id=y and a.state='active'
      and p_level in (select edra_private.assessment_levels('assignment',a.id));
  update public.exams e set offering_closed_at=at,version=version+1,updated_at=at,updated_by=auth.uid()
    where e.academy_id=p_academy and e.academic_year_id=y and e.archived_at is null and e.offering_closed_at is null
      and (e.actual_closes_at is null or e.actual_closes_at>at)
      and (select array_agg(l) from edra_private.assessment_levels('exam',e.id) l)=array[p_level];
  update public.quizzes q set offering_closed_at=at,version=version+1,updated_at=at,updated_by=auth.uid()
    where q.academy_id=p_academy and q.academic_year_id=y and q.archived_at is null and q.offering_closed_at is null
      and (q.actual_closes_at is null or q.actual_closes_at>at)
      and (select array_agg(l) from edra_private.assessment_levels('quiz',q.id) l)=array[p_level];
  update public.content_units u set version=version+1,updated_at=at from public.content_programs p
    where u.program_id=p.id and p.academy_id=p_academy and p.academic_year_id=y and p.level_id=p_level and u.state<>'archived';
  update public.academy_levels set stopped_at=at,stopped_by=auth.uid(),last_stopped_at=at,last_stopped_by=auth.uid(),
    learning_epoch=learning_epoch+1,version=version+1 where academy_id=p_academy and level_id=p_level;
  for z in select id from public.exams where academy_id=p_academy and academic_year_id=y and offering_closed_at=at order by id loop
    perform edra_private.settle_exam_closure(z.id);
  end loop;
  for z in select id from public.quizzes where academy_id=p_academy and academic_year_id=y and offering_closed_at=at order by id loop
    perform edra_private.settle_quiz_closure(z.id);
  end loop;
  delete from edra_private.offering_transitions where transaction_id=pg_current_xact_id() and academy_id=p_academy;
  return null;
end $$;

-- The helpers above are reachable only from the authorized, gated command.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='edra_private' and p.proname in ('offering_group_write_gate','guard_group_lineage',
      'assessment_levels','guard_frozen_exam','guard_frozen_exam_groups','retire_offering_track','stop_offering_level') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;


-- Existing domain integrations retain their public signatures and internal invariants.
create or replace function edra_private.require_assessment_offering(p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a jsonb; g record;
begin
  if p_kind not in ('assignment','quiz','exam') then raise exception 'validation'; end if;
  execute format('select to_jsonb(a) from public.%I a where id=$1',p_kind||'s') into a using p_id;
  if a is null then raise exception 'not_found'; end if;
  if a->>'audience'='groups' then
    for g in execute format('select g.* from public.%I x join public.groups g on g.id=x.group_id where x.%I=$1',p_kind||'_audience_groups',p_kind||'_id') using p_id loop
      perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id);
    end loop;
  elsif a->>'level_id' is not null then
    perform edra_private.require_offering((a->>'academy_id')::uuid,a->>'level_id',case when p_kind='exam' and a->>'roster_frozen_at' is not null then null else (a->>'track_id')::uuid end);
  end if;
  if a->>'offering_closed_at' is not null then raise exception 'offering_closed'; end if;
end $$;

create or replace function edra_private.end_assignment_requirements_on_placement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.track_id is not null and new.track_id is null and edra_private.offering_transition(new.academy_id,new.level_id,old.track_id,'remove_track') then return null; end if;
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

create or replace function edra_private.snapshot_assignment_recipients(p_target public.assignments)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
  basis jsonb;
  previous jsonb;
  next_revision integer;
  total integer;
begin
  perform edra_private.offering_gate();
  select a.* into target from public.assignments a where a.id=p_target.id for update;
  basis:=edra_private.assignment_audience_basis(target);
  if target.cohort_revision>0 then
    select coalesce((select b.audience_basis from edra_private.assignment_offering_basis b where b.assignment_id=target.id and b.cohort_revision=target.cohort_revision),c.audience_basis) into previous from public.assignment_cohorts c
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

create or replace function edra_private.update_exam(p_academy_id uuid, p_exam_id uuid, p_expected_version integer, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  draft record;
  current_groups uuid[];
begin
  perform edra_private.require_exam_role(p_academy_id, false);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, true);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'exam_conflict';
  end if;
  perform edra_private.parse_exam_draft(p_draft);
  select * into draft from pg_temp.exam_draft;

  if target.work_started_at is not null or target.roster_frozen_at is not null then
    select coalesce(array_agg(g.group_id order by g.group_id), '{}') into current_groups from public.exam_audience_groups g where g.exam_id = target.id;
    if (draft.audience, draft.level_id, draft.track_id)
        is distinct from (target.audience, target.level_id, target.track_id)
      or (target.work_started_at is not null and draft.time_limit_minutes is distinct from target.time_limit_minutes)
      or (select coalesce(array_agg(g order by g), '{}') from unnest(draft.group_ids) g) <> current_groups then
      raise exception using errcode = 'P0001', message = 'target_locked';
    end if;
  else
    perform edra_private.check_exam_audience(target.academy_id, target.academic_year_id, draft.audience, draft.level_id, draft.track_id, draft.group_ids);
  end if;

  if target.structure_locked_at is not null then
    if edra_private.exam_draft_signature() <> edra_private.exam_structure_signature(target.id) then
      raise exception using errcode = 'P0001', message = 'structure_locked';
    end if;
    update public.exam_questions q set model_answer = dq.model_answer
    from pg_temp.exam_draft_questions dq where dq.id = q.id and q.exam_id = target.id and q.model_answer <> dq.model_answer;
  else
    perform edra_private.write_exam_structure(target);
  end if;

  update public.exams set title = draft.title, instructions = draft.instructions, solution_notes = draft.solution_notes,
    audience = draft.audience, level_id = draft.level_id, track_id = draft.track_id, time_limit_minutes = draft.time_limit_minutes,
    version = version + 1, updated_by = actor, updated_at = now()
  where id = target.id;
  return edra_private.exam_json(target.id);
end;
$$;

create or replace function edra_private.write_exam_structure(p_target public.exams)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  draft record;
begin
  select * into draft from pg_temp.exam_draft;
  -- Existing ids must belong to this exam and to the same part/question as in the draft.
  if exists (select 1 from pg_temp.exam_draft_parts d where d.id is not null and not exists (
      select 1 from public.exam_parts p where p.id = d.id and p.exam_id = p_target.id))
    or exists (
      select 1 from pg_temp.exam_draft_questions dq join pg_temp.exam_draft_parts dp on dp.position = dq.part_position
      where dq.id is not null and not exists (
        select 1 from public.exam_questions q where q.id = dq.id and q.part_id = dp.id and q.exam_id = p_target.id))
    or exists (
      select 1 from pg_temp.exam_draft_choices dc
      join pg_temp.exam_draft_questions dq on dq.part_position = dc.part_position and dq.position = dc.question_position
      where dc.id is not null and not exists (
        select 1 from public.exam_choices c where c.id = dc.id and c.question_id = dq.id and c.exam_id = p_target.id)) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'ids';
  end if;

  if p_target.roster_frozen_at is null then
  delete from public.exam_audience_groups g where g.exam_id = p_target.id;
  if draft.audience = 'groups' then
    insert into public.exam_audience_groups (exam_id, academy_id, academic_year_id, group_id)
    select p_target.id, p_target.academy_id, p_target.academic_year_id, unnest(draft.group_ids);
  end if;

  end if;

  delete from public.exam_choices c
  where c.exam_id = p_target.id and c.id not in (select dc.id from pg_temp.exam_draft_choices dc where dc.id is not null);
  delete from public.exam_questions q
  where q.exam_id = p_target.id and q.id not in (select dq.id from pg_temp.exam_draft_questions dq where dq.id is not null);
  delete from public.exam_parts p
  where p.exam_id = p_target.id and p.id not in (select d.id from pg_temp.exam_draft_parts d where d.id is not null);

  update public.exam_parts p set position = d.position, title = d.title, instructions = d.instructions, kind = d.kind
  from pg_temp.exam_draft_parts d where d.id = p.id and p.exam_id = p_target.id;
  insert into public.exam_parts (academy_id, exam_id, position, title, instructions, kind)
  select p_target.academy_id, p_target.id, d.position, d.title, d.instructions, d.kind
  from pg_temp.exam_draft_parts d where d.id is null;

  update public.exam_choices c set is_correct = false where c.exam_id = p_target.id and c.is_correct;
  update public.exam_questions q set position = dq.position, prompt = dq.prompt, model_answer = dq.model_answer, max_score = dq.max_score
  from pg_temp.exam_draft_questions dq where dq.id = q.id and q.exam_id = p_target.id;
  insert into public.exam_questions (academy_id, exam_id, part_id, position, prompt, model_answer, max_score)
  select p_target.academy_id, p_target.id, p.id, dq.position, dq.prompt, dq.model_answer, dq.max_score
  from pg_temp.exam_draft_questions dq
  join public.exam_parts p on p.exam_id = p_target.id and p.position = dq.part_position
  where dq.id is null;

  update public.exam_choices c set position = dc.position, label = dc.label, is_correct = dc.is_correct
  from pg_temp.exam_draft_choices dc where dc.id = c.id and c.exam_id = p_target.id;
  insert into public.exam_choices (academy_id, exam_id, question_id, position, label, is_correct)
  select p_target.academy_id, p_target.id, q.id, dc.position, dc.label, dc.is_correct
  from pg_temp.exam_draft_choices dc
  join public.exam_parts p on p.exam_id = p_target.id and p.position = dc.part_position
  join public.exam_questions q on q.part_id = p.id and q.position = dc.question_position
  where dc.id is null;
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
  perform edra_private.offering_gate();
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
    or (holder.archived_at is not null and not (p_target.offering_closed_at is not null and exists(select 1 from public.assignment_recipients r where r.assignment_id=p_target.id and r.annual_student_record_id=holder.id and r.work_status in ('submitted','late')))) or holder.level_id <> code_row.level_id
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

create or replace function edra_private.quiz_phase(p_quiz public.quizzes, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_quiz.archived_at is not null then 'archived'
    when p_quiz.offering_closed_at is not null then 'closed'
    when p_quiz.closes_at is not null and p_at >= least(p_quiz.actual_closes_at,p_quiz.offering_closed_at) then 'closed'
    when not edra_private.quiz_ready(p_quiz.id) then 'preparing'
    when p_quiz.opens_at is null then 'ready'
    when p_at < p_quiz.opens_at then 'scheduled'
    when p_at < p_quiz.closes_at then 'open'
    else 'headroom'
  end;
$$;

create or replace function edra_private.quiz_json(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_build_object(
      'id', z.id, 'academy_id', z.academy_id, 'academic_year_id', z.academic_year_id,
      'title', z.title, 'instructions', z.instructions, 'solution_notes', z.solution_notes,
      'audience', z.audience, 'level_id', z.level_id, 'track_id', z.track_id,
      'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.quiz_audience_groups g where g.quiz_id = z.id), '[]'::jsonb),
      'time_limit_minutes', z.time_limit_minutes,
      'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', least(z.actual_closes_at,z.offering_closed_at),
      'max_score', z.max_score::text,
      'effective_max_score', coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = z.id and q.excluded_at is null), 0)::text,
      'question_count', z.question_count,
      'version', z.version, 'scoring_revision', z.scoring_revision,
      'work_started_at', z.work_started_at, 'structure_locked_at', z.structure_locked_at,
      'closure_settled_at', (select c.settled_at from public.quiz_closures c where c.quiz_id = z.id),
      'processing_pending', edra_private.quiz_has_due_work(z.id),
      'created_by', z.created_by, 'created_at', z.created_at, 'updated_by', z.updated_by, 'updated_at', z.updated_at,
      'archived_at', z.archived_at,
      'year_open', exists (select 1 from public.academic_years y where y.id = z.academic_year_id and y.closed_at is null),
      'ready', edra_private.quiz_ready(z.id),
      'issues', edra_private.quiz_issues(z.id),
      'phase', edra_private.quiz_phase(z, clock_timestamp()),
      'server_now', clock_timestamp(),
      'fully_automatic', edra_private.quiz_fully_automatic(z.id),
      'counts', jsonb_build_object(
        'eligible', (select count(*) from edra_private.quiz_audience_records(z.id)),
        'started', (select count(*) from public.quiz_attempts a where a.quiz_id = z.id),
        'in_progress', (select count(*) from public.quiz_attempts a where a.quiz_id = z.id and a.finalized_at is null and a.superseded_at is null),
        'submitted', (select count(*) from public.quiz_work w where w.quiz_id = z.id and w.accepted_submission_id is not null),
        'announced', (select count(*) from public.quiz_work w where w.quiz_id = z.id and w.published_revision > 0)
      ),
      'corrections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'revision', k.revision, 'kind', k.kind, 'question_id', k.question_id, 'previous_choice_id', k.previous_choice_id,
          'choice_id', k.choice_id, 'created_by', k.created_by, 'created_at', k.created_at
        ) order by k.revision) from public.quiz_corrections k where k.quiz_id = z.id
      ), '[]'::jsonb),
      'parts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'position', p.position, 'title', p.title, 'instructions', p.instructions, 'kind', p.kind,
          'questions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', q.id, 'position', q.position, 'number', n.number, 'prompt', q.prompt, 'model_answer', q.model_answer,
              'max_score', q.max_score::text, 'excluded', q.excluded_at is not null, 'excluded_at', q.excluded_at,
              'choices', coalesce((
                select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label, 'is_correct', c.is_correct) order by c.position)
                from public.quiz_choices c where c.question_id = q.id
              ), '[]'::jsonb)
            ) order by q.position)
            from public.quiz_questions q
            join (
              select q2.id, row_number() over (order by p2.position, q2.position) as number
              from public.quiz_questions q2 join public.quiz_parts p2 on p2.id = q2.part_id where q2.quiz_id = z.id
            ) n on n.id = q.id
            where q.part_id = p.id
          ), '[]'::jsonb)
        ) order by p.position)
        from public.quiz_parts p where p.quiz_id = z.id
      ), '[]'::jsonb)
    )
    from public.quizzes z where z.id = p_quiz_id
  );
$$;

create or replace function edra_private.configure_quiz_availability(
  p_academy_id uuid, p_quiz_id uuid, p_expected_version integer, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  started boolean;
  at timestamptz := clock_timestamp();
begin
  perform edra_private.require_assessment_offering('quiz',p_quiz_id);
  perform edra_private.require_quiz_role(p_academy_id, true);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, true);
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  -- Time is read after the locks so a blocked request cannot act on a window that has since closed.
  at := clock_timestamp();
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  if least(target.actual_closes_at,target.offering_closed_at) is not null and at >= least(target.actual_closes_at,target.offering_closed_at) then
    raise exception using errcode = 'P0001', message = 'quiz_closed';
  end if;
  started := target.work_started_at is not null;
  if (p_opens_at is null) <> (p_closes_at is null) then raise exception using errcode = 'P0001', message = 'validation'; end if;

  if p_opens_at is null then
    if target.opens_at is not null and (at >= target.opens_at or started) then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
  else
    if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
    if p_opens_at >= p_closes_at or p_closes_at <= at then raise exception using errcode = 'P0001', message = 'validation'; end if;
    if target.opens_at is not null and at >= target.opens_at and p_opens_at <> target.opens_at then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
    if started and target.closes_at is not null and p_closes_at < target.closes_at then
      raise exception using errcode = 'P0001', message = 'window_locked';
    end if;
  end if;

  update public.quizzes set opens_at = p_opens_at, closes_at = p_closes_at,
    actual_closes_at = p_closes_at + interval '2 minutes',
    availability_updated_by = actor, availability_updated_at = at,
    version = version + 1, updated_by = actor, updated_at = at
  where id = target.id;
  return edra_private.quiz_json(target.id);
end;
$$;

create or replace function edra_private.settle_quiz_record(p_target public.quizzes, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  attempt public.quiz_attempts%rowtype;
  work public.quiz_work%rowtype;
  cutoff timestamptz;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  select a.* into attempt from public.quiz_attempts a
  where a.quiz_id = p_target.id and a.annual_student_record_id = p_record_id;
  if not found or attempt.finalized_at is not null or attempt.superseded_at is not null then return; end if;
  work := edra_private.lock_quiz_work(p_target, p_record_id, false);
  select a.* into attempt from public.quiz_attempts a where a.id = attempt.id for update;
  t_now := clock_timestamp();
  cutoff := least(attempt.deadline_at, least(p_target.actual_closes_at,p_target.offering_closed_at));
  if attempt.finalized_at is not null or attempt.superseded_at is not null or cutoff is null or t_now < cutoff then return; end if;
  if work.accepted_submission_id is not null then
    update public.quiz_attempts set superseded_at = t_now where id = attempt.id;
    return;
  end if;
  perform edra_private.accept_quiz_submission(p_target, p_record_id, 'online',
    case when attempt.deadline_at is not null and (least(p_target.actual_closes_at,p_target.offering_closed_at) is null or attempt.deadline_at <= least(p_target.actual_closes_at,p_target.offering_closed_at))
      then 'timer' else 'window_closed' end::public.quiz_finalization_reason,
    cutoff, t_now);
end;
$$;

create or replace function edra_private.settle_quiz_attempts(p_target public.quizzes)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  due record;
  settled integer := 0;
begin
  for due in
    select a.annual_student_record_id from public.quiz_attempts a
    where a.quiz_id = p_target.id and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at, least(p_target.actual_closes_at,p_target.offering_closed_at)) <= clock_timestamp()
    order by a.annual_student_record_id
  loop
    perform edra_private.settle_quiz_record(p_target, due.annual_student_record_id);
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;

create or replace function edra_private.settle_quiz_closure(p_quiz_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  settled integer;
  t_now timestamptz;
  qualifying record;
begin
  perform edra_private.offering_gate();
  -- Year share lock first (the lock order shared with year closure), then the exclusive quiz lock.
  select z.* into target from public.quizzes z where z.id = p_quiz_id;
  if not found or least(target.actual_closes_at,target.offering_closed_at) is null then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id for share;
  select z.* into target from public.quizzes z where z.id = p_quiz_id for update;
  if not found then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id and y.closed_at is null;
  if not found then return 0; end if;
  settled := edra_private.settle_quiz_attempts(target);
  t_now := clock_timestamp();
  if t_now < least(target.actual_closes_at,target.offering_closed_at) then return settled; end if;
  insert into public.quiz_closures (quiz_id, academy_id, closed_at, settled_at)
  values (target.id, target.academy_id, least(target.actual_closes_at,target.offering_closed_at), t_now)
  on conflict do nothing;
  for qualifying in
    select w.annual_student_record_id from public.quiz_work w
    where w.quiz_id = target.id and w.solutions_qualified_at is null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
    order by w.annual_student_record_id
  loop
    perform 1 from public.quiz_work w where w.quiz_id = target.id and w.annual_student_record_id = qualifying.annual_student_record_id for update;
    perform edra_private.qualify_quiz_solutions(target, qualifying.annual_student_record_id, t_now);
  end loop;
  return settled;
end;
$$;

create or replace function edra_private.quiz_has_due_work(p_quiz_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
    where a.quiz_id = p_quiz_id and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) <= clock_timestamp()
  ) or exists (
    select 1 from public.quizzes z
    where z.id = p_quiz_id and least(z.actual_closes_at,z.offering_closed_at) <= clock_timestamp()
      and not exists (select 1 from public.quiz_closures c where c.quiz_id = z.id)
  );
$$;

create or replace function edra_private.quiz_student_state(p_quiz_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'quiz_id', z.id, 'title', z.title, 'instructions', z.instructions,
    'server_now', clock_timestamp(),
    'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', least(z.actual_closes_at,z.offering_closed_at),
    'time_limit_minutes', z.time_limit_minutes,
    'phase', edra_private.quiz_phase(z, clock_timestamp()),
    'eligible', edra_private.quiz_is_eligible(z.id, p_record_id),
    'excluded_question_ids', case when reveal.questions then coalesce((select jsonb_agg(x.id order by x.id) from public.quiz_questions x where x.quiz_id = z.id and x.excluded_at is not null), '[]'::jsonb) else '[]'::jsonb end,
    'parts', case when reveal.questions then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'position', pt.position, 'title', pt.title, 'instructions', pt.instructions, 'kind', pt.kind,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'position', qq.position, 'prompt', qq.prompt, 'max_score', qq.max_score::text,
            'excluded', qq.excluded_at is not null,
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label) order by c.position)
              from public.quiz_choices c where c.question_id = qq.id), '[]'::jsonb)
          ) order by qq.position) from public.quiz_questions qq where qq.part_id = pt.id
        ), '[]'::jsonb)
      ) order by pt.position) from public.quiz_parts pt where pt.quiz_id = z.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'attempt', (select jsonb_build_object(
        'started_at', a.started_at, 'deadline_at', a.deadline_at,
        'cutoff_at', least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)),
        'answers_version', a.answers_version, 'departure_count', a.departure_count,
        'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason, 'superseded', a.superseded_at is not null,
        'answers', coalesce((select jsonb_agg(jsonb_build_object('question_id', o.question_id, 'choice_id', o.choice_id, 'text_answer', o.text_answer)
          order by o.question_id) from public.quiz_online_answers o where o.attempt_id = a.id), '[]'::jsonb)
      ) from public.quiz_attempts a where a.quiz_id = z.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'original_deadline_at', s.original_deadline_at)
      from public.quiz_work w join public.quiz_submissions s on s.id = w.accepted_submission_id
      where w.quiz_id = z.id and w.annual_student_record_id = p_record_id),
    -- Only the latest official revision; private marks and draft scores are never included.
    'result', (select jsonb_build_object('revision', p.revision, 'total', p.total::text, 'max_score', p.max_score::text,
        'feedback', p.feedback, 'items', p.items, 'published_at', p.published_at)
      from public.quiz_work w join public.quiz_result_publications p on p.quiz_id = w.quiz_id
        and p.annual_student_record_id = w.annual_student_record_id and p.revision = w.published_revision
      where w.quiz_id = z.id and w.annual_student_record_id = p_record_id),
    -- Solutions only once qualified: an accepted online submission at actual closure, or accepted
    -- physical work at actual closure with an announced result.
    'solutions', case when reveal.solutions then jsonb_build_object(
        'notes', z.solution_notes,
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'question_id', qq.id, 'model_answer', qq.model_answer,
            'correct_choice_id', (select c.id from public.quiz_choices c where c.question_id = qq.id and c.is_correct)
          ) order by qq.id) from public.quiz_questions qq where qq.quiz_id = z.id), '[]'::jsonb)
      ) end
  )
  from public.quizzes z
  cross join lateral (select edra_private.quiz_solutions_available(z, p_record_id, clock_timestamp()) as solutions) qualified
  cross join lateral (select qualified.solutions, qualified.solutions or exists (
    select 1 from public.quiz_attempts a
    where a.quiz_id = z.id and a.annual_student_record_id = p_record_id and a.started_at is not null
  ) as questions) reveal
  where z.id = p_quiz_id;
$$;

create or replace function edra_private.save_quiz_answers_for(
  p_quiz_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  attempt public.quiz_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  if p_expected_version is null or p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) not between 1 and 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_quiz_if_due(p_quiz_id);
  target := edra_private.lock_quiz_by_id(p_quiz_id, false);
  replay := edra_private.quiz_replay(p_key, 'answers', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  perform edra_private.lock_quiz_work(target, p_record_id, false);
  select a.* into attempt from public.quiz_attempts a
  where a.quiz_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  t_now := clock_timestamp();
  -- Returned rather than raised so the settlement above commits.
  if attempt.finalized_at is not null or attempt.superseded_at is not null
    or t_now >= least(attempt.deadline_at, least(target.actual_closes_at,target.offering_closed_at)) then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.quiz_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  -- Saving new answers needs current eligibility; settlement of already saved work does not.
  perform edra_private.require_quiz_placement(target, p_record_id);
  if attempt.answers_version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'state', edra_private.quiz_student_state(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.quiz_answer_input (question_id uuid, choice_id uuid, text_answer text, has_text boolean) on commit drop;
  truncate pg_temp.quiz_answer_input;
  begin
    insert into pg_temp.quiz_answer_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid, e->>'text_answer', e ? 'text_answer'
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object'
      and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id', 'text_answer'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.quiz_answer_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.quiz_answer_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.quiz_answer_input i where i.question_id is null or char_length(coalesce(i.text_answer, '')) > 10000) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- The answer shape must match the question kind; choices must belong to the question.
  if exists (
    select 1 from pg_temp.quiz_answer_input i
    left join public.quiz_questions q on q.id = i.question_id and q.quiz_id = target.id
    left join public.quiz_parts p on p.id = q.part_id
    where q.id is null
      or (p.kind = 'question_sheet' and (i.has_text or (i.choice_id is not null and not exists (
        select 1 from public.quiz_choices c where c.question_id = q.id and c.id = i.choice_id))))
      or (p.kind = 'written_work' and i.choice_id is not null)
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;
  -- Excluded questions are skipped: a changed answer is rejected, an unchanged one is ignored.
  if exists (
    select 1 from pg_temp.quiz_answer_input i
    join public.quiz_questions q on q.id = i.question_id and q.excluded_at is not null
    left join public.quiz_online_answers o on o.attempt_id = attempt.id and o.question_id = i.question_id
    where (o.choice_id, o.text_answer) is distinct from (i.choice_id, nullif(i.text_answer, ''))
  ) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
  end if;
  insert into public.quiz_online_answers (attempt_id, academy_id, quiz_id, question_id, choice_id, text_answer, saved_at)
  select attempt.id, target.academy_id, target.id, i.question_id, i.choice_id, nullif(i.text_answer, ''), t_now
  from pg_temp.quiz_answer_input i
  join public.quiz_questions q on q.id = i.question_id and q.excluded_at is null
  on conflict (attempt_id, question_id) do update set choice_id = excluded.choice_id, text_answer = excluded.text_answer, saved_at = excluded.saved_at;
  update public.quiz_attempts set answers_version = answers_version + 1, last_saved_at = t_now where id = attempt.id;
  perform edra_private.mark_quiz_activity(target, true);
  return edra_private.remember_quiz_request(p_key, 'answers', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'state', edra_private.quiz_student_state(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.save_quiz_physical_draft(
  p_academy_id uuid, p_quiz_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  draft public.quiz_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  perform edra_private.require_quiz_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_answers is null
    or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_quiz(p_academy_id, p_quiz_id);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, false);
  replay := edra_private.quiz_replay(p_key, 'physical_draft', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.quiz_student_row(target.id, p_record_id),
      'answers', edra_private.quiz_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_quiz_placement(target, p_record_id);
  if least(target.actual_closes_at,target.offering_closed_at) is not null and t_now >= least(target.actual_closes_at,target.offering_closed_at) then raise exception using errcode = 'P0001', message = 'quiz_closed'; end if;
  select d.* into draft from public.quiz_physical_drafts d where d.quiz_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'student', edra_private.quiz_student_row(target.id, p_record_id),
      'answers', edra_private.quiz_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.quiz_physical_input (question_id uuid, choice_id uuid) on commit drop;
  truncate pg_temp.quiz_physical_input;
  begin
    insert into pg_temp.quiz_physical_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object' and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.quiz_physical_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.quiz_physical_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.quiz_physical_input i where i.question_id is null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (
    select 1 from pg_temp.quiz_physical_input i
    left join public.quiz_questions q on q.id = i.question_id and q.quiz_id = target.id
    left join public.quiz_parts p on p.id = q.part_id
    where q.id is null or p.kind <> 'question_sheet'
      or (i.choice_id is not null and not exists (select 1 from public.quiz_choices c where c.question_id = q.id and c.id = i.choice_id))
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;

  if draft.quiz_id is null then
    insert into public.quiz_physical_drafts (quiz_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  else
    update public.quiz_physical_drafts set version = version + 1, updated_by = actor, updated_at = t_now
    where quiz_id = target.id and annual_student_record_id = p_record_id;
  end if;
  delete from public.quiz_physical_answers a where a.quiz_id = target.id and a.annual_student_record_id = p_record_id
    and a.question_id not in (select i.question_id from pg_temp.quiz_physical_input i);
  insert into public.quiz_physical_answers (quiz_id, annual_student_record_id, academy_id, question_id, choice_id)
  select target.id, p_record_id, target.academy_id, i.question_id, i.choice_id from pg_temp.quiz_physical_input i
  on conflict (quiz_id, annual_student_record_id, question_id) do update set choice_id = excluded.choice_id;
  if jsonb_array_length(p_answers) > 0 then perform edra_private.mark_quiz_activity(target, true);
  else perform edra_private.mark_quiz_activity(target, false); end if;
  return edra_private.remember_quiz_request(p_key, 'physical_draft', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'student', edra_private.quiz_student_row(target.id, p_record_id),
      'answers', edra_private.quiz_physical_answers_json(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.confirm_quiz_physical(
  p_academy_id uuid, p_quiz_id uuid, p_record_id uuid, p_expected_version integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  draft public.quiz_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  perform edra_private.require_quiz_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_key is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_quiz(p_academy_id, p_quiz_id);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, false);
  replay := edra_private.quiz_replay(p_key, 'confirm', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  -- An online attempt already past its cutoff is finalized first, so it wins over a late confirmation.
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.quiz_student_row(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_quiz_placement(target, p_record_id);
  if least(target.actual_closes_at,target.offering_closed_at) is not null and t_now >= least(target.actual_closes_at,target.offering_closed_at) then raise exception using errcode = 'P0001', message = 'quiz_closed'; end if;
  select d.* into draft from public.quiz_physical_drafts d where d.quiz_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  if draft.quiz_id is null then
    insert into public.quiz_physical_drafts (quiz_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  end if;
  perform edra_private.accept_quiz_submission(target, p_record_id, 'physical', 'physical', t_now, t_now);
  perform edra_private.mark_quiz_activity(target, false);
  return edra_private.remember_quiz_request(p_key, 'confirm', target, fingerprint,
    jsonb_build_object('outcome', 'confirmed', 'student', edra_private.quiz_student_row(target.id, p_record_id)));
end;
$$;

create or replace function public.list_quizzes(
  p_academy_id uuid, p_academic_year_id uuid, p_search text, p_phase text, p_audience public.quiz_audience,
  p_include_archived boolean, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
    or (p_phase is not null and p_phase <> all (array['preparing', 'ready', 'scheduled', 'open', 'headroom', 'closed', 'archived']))
    or char_length(coalesce(p_search, '')) > 200 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with base as (
    select z.*, edra_private.quiz_phase(z, at_now) as phase from public.quizzes z
    where z.academy_id = p_academy_id
      and (p_academic_year_id is null or z.academic_year_id = p_academic_year_id)
      and (p_audience is null or z.audience = p_audience)
      and (coalesce(p_search, '') = '' or strpos(lower(z.title), lower(btrim(p_search))) > 0)
  ),
  filtered as (
    select b.* from base b
    where case when p_phase is not null then b.phase = p_phase else (p_include_archived or b.phase <> 'archived') end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'academic_year_id', f.academic_year_id, 'title', f.title, 'audience', f.audience,
        'level_id', f.level_id, 'track_id', f.track_id,
        'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.quiz_audience_groups g where g.quiz_id = f.id), '[]'::jsonb),
        'time_limit_minutes', f.time_limit_minutes, 'opens_at', f.opens_at, 'closes_at', f.closes_at, 'actual_closes_at', least(f.actual_closes_at,f.offering_closed_at),
        'max_score', f.max_score::text,
        'effective_max_score', coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = f.id and q.excluded_at is null), 0)::text,
        'question_count', f.question_count, 'phase', f.phase, 'updated_at', f.updated_at,
        'submitted', (select count(*) from public.quiz_work w where w.quiz_id = f.id and w.accepted_submission_id is not null),
        'in_progress', (select count(*) from public.quiz_attempts a where a.quiz_id = f.id and a.finalized_at is null and a.superseded_at is null),
        'announced', (select count(*) from public.quiz_work w where w.quiz_id = f.id and w.published_revision > 0),
        'processing_pending', edra_private.quiz_has_due_work(f.id),
        'closure_settled_at', (select c.settled_at from public.quiz_closures c where c.quiz_id = f.id)
      ) order by f.created_at desc, f.id)
      from (select * from filtered order by created_at desc, id limit p_limit offset p_offset) f
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

create or replace function edra_private.run_quiz_deadlines(p_limit integer default 50)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  run_started timestamptz := clock_timestamp();
  due record;
  quiz_count integer := 0;
  attempt_count integer := 0;
  failure_count integer := 0;
  last_error text;
  lag numeric;
begin
  for due in
    select candidates.quiz_id from (
      select z.id as quiz_id, least(z.actual_closes_at,z.offering_closed_at) as due_at from public.quizzes z
      where least(z.actual_closes_at,z.offering_closed_at) <= clock_timestamp() and not exists (select 1 from public.quiz_closures c where c.quiz_id = z.id)
      union all
      select a.quiz_id, least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) from public.quiz_attempts a
      join public.quizzes z on z.id = a.quiz_id
      where a.finalized_at is null and a.superseded_at is null and least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) <= clock_timestamp()
    ) candidates
    join public.quizzes z on z.id = candidates.quiz_id
    join public.academic_years y on y.id = z.academic_year_id and y.closed_at is null
    group by candidates.quiz_id
    order by min(candidates.due_at), candidates.quiz_id
    limit greatest(coalesce(p_limit, 50), 1)
  loop
    begin
      attempt_count := attempt_count + edra_private.settle_quiz_closure(due.quiz_id);
      quiz_count := quiz_count + 1;
    exception when others then
      failure_count := failure_count + 1;
      last_error := due.quiz_id::text || ': ' || sqlerrm;
    end;
  end loop;
  select max(extract(epoch from s.processed_at - s.submitted_at)) into lag
  from public.quiz_submissions s
  where s.processed_at >= run_started and s.source = 'online' and s.reason in ('timer', 'window_closed');
  insert into edra_private.quiz_deadline_runs (started_at, finished_at, quizzes, attempts, failures, max_lag_seconds, error)
  values (run_started, clock_timestamp(), quiz_count, attempt_count, failure_count, lag, last_error);
  -- Keep a week of run history.
  delete from edra_private.quiz_deadline_runs where started_at < run_started - interval '7 days';
  return attempt_count;
end;
$$;

create or replace function edra_private.quiz_deadline_health()
returns table (last_run_at timestamptz, runs_last_hour integer, failures_last_hour integer, max_lag_seconds_last_hour numeric, oldest_overdue_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select
    (select max(r.finished_at) from edra_private.quiz_deadline_runs r),
    (select count(*)::integer from edra_private.quiz_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select coalesce(sum(r.failures), 0)::integer from edra_private.quiz_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(r.max_lag_seconds) from edra_private.quiz_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(extract(epoch from clock_timestamp() - least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at))))
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      join public.academic_years y on y.id = z.academic_year_id and y.closed_at is null
      where a.finalized_at is null and a.superseded_at is null and least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) <= clock_timestamp());
$$;

create or replace function edra_private.exam_phase(p_exam public.exams, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_exam.archived_at is not null then 'archived'
    when p_exam.offering_closed_at is not null then 'closed'
    when p_exam.closes_at is not null and p_at >= least(p_exam.actual_closes_at,p_exam.offering_closed_at) then 'closed'
    when not edra_private.exam_ready(p_exam.id) then 'preparing'
    when p_exam.opens_at is null then 'ready'
    when p_at < p_exam.opens_at then 'scheduled'
    when p_at < p_exam.closes_at then 'open'
    else 'headroom'
  end;
$$;

create or replace function edra_private.exam_json(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_build_object(
      'id', z.id, 'academy_id', z.academy_id, 'academic_year_id', z.academic_year_id,
      'title', z.title, 'instructions', z.instructions, 'solution_notes', z.solution_notes,
      'audience', z.audience, 'level_id', z.level_id, 'track_id', z.track_id,
      'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.exam_audience_groups g where g.exam_id = z.id), '[]'::jsonb),
      'time_limit_minutes', z.time_limit_minutes,
      'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', least(z.actual_closes_at,z.offering_closed_at),
      'max_score', z.max_score::text,
      'effective_max_score', coalesce((select sum(q.max_score) from public.exam_questions q where q.exam_id = z.id and q.excluded_at is null), 0)::text,
      'question_count', z.question_count,
      'version', z.version, 'scoring_revision', z.scoring_revision,
      'work_started_at', z.work_started_at, 'structure_locked_at', z.structure_locked_at,
      'closure_settled_at', (select c.settled_at from public.exam_closures c where c.exam_id = z.id),
      'processing_pending', edra_private.exam_has_due_work(z.id),
      'created_by', z.created_by, 'created_at', z.created_at, 'updated_by', z.updated_by, 'updated_at', z.updated_at,
      'archived_at', z.archived_at,
      'year_open', exists (select 1 from public.academic_years y where y.id = z.academic_year_id and y.closed_at is null),
      'ready', edra_private.exam_ready(z.id),
      'issues', edra_private.exam_issues(z.id),
      'phase', edra_private.exam_phase(z, clock_timestamp()),
      'server_now', clock_timestamp(),
      'fully_automatic', edra_private.exam_fully_automatic(z.id),
      'counts', jsonb_build_object(
        'eligible', (select count(*) from edra_private.exam_audience_records(z.id)),
        'started', (select count(*) from public.exam_attempts a where a.exam_id = z.id),
        'in_progress', (select count(*) from public.exam_attempts a where a.exam_id = z.id and a.finalized_at is null and a.superseded_at is null),
        'submitted', (select count(*) from public.exam_work w where w.exam_id = z.id and w.accepted_submission_id is not null),
        'announced', (select count(*) from public.exam_work w where w.exam_id = z.id and w.published_revision > 0)
      ),
      'corrections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'revision', k.revision, 'kind', k.kind, 'question_id', k.question_id, 'previous_choice_id', k.previous_choice_id,
          'choice_id', k.choice_id, 'created_by', k.created_by, 'created_at', k.created_at
        ) order by k.revision) from public.exam_corrections k where k.exam_id = z.id
      ), '[]'::jsonb),
      'parts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'position', p.position, 'title', p.title, 'instructions', p.instructions, 'kind', p.kind,
          'questions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', q.id, 'position', q.position, 'number', n.number, 'prompt', q.prompt, 'model_answer', q.model_answer,
              'max_score', q.max_score::text, 'excluded', q.excluded_at is not null, 'excluded_at', q.excluded_at,
              'choices', coalesce((
                select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label, 'is_correct', c.is_correct) order by c.position)
                from public.exam_choices c where c.question_id = q.id
              ), '[]'::jsonb)
            ) order by q.position)
            from public.exam_questions q
            join (
              select q2.id, row_number() over (order by p2.position, q2.position) as number
              from public.exam_questions q2 join public.exam_parts p2 on p2.id = q2.part_id where q2.exam_id = z.id
            ) n on n.id = q.id
            where q.part_id = p.id
          ), '[]'::jsonb)
        ) order by p.position)
        from public.exam_parts p where p.exam_id = z.id
      ), '[]'::jsonb)
    )
    from public.exams z where z.id = p_exam_id
  );
$$;

create or replace function edra_private.configure_exam_availability(
  p_academy_id uuid, p_exam_id uuid, p_expected_version integer, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  started boolean;
  at timestamptz := clock_timestamp();
begin
  perform edra_private.require_assessment_offering('exam',p_exam_id);
  perform edra_private.require_exam_role(p_academy_id, true);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, true);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  -- Time is read after the locks so a blocked request cannot act on a window that has since closed.
  at := clock_timestamp();
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'exam_conflict';
  end if;
  if least(target.actual_closes_at,target.offering_closed_at) is not null and at >= least(target.actual_closes_at,target.offering_closed_at) then
    raise exception using errcode = 'P0001', message = 'exam_closed';
  end if;
  started := target.work_started_at is not null;
  if (p_opens_at is null) <> (p_closes_at is null) then raise exception using errcode = 'P0001', message = 'validation'; end if;

  if p_opens_at is null then
    if target.opens_at is not null and (at >= target.opens_at or started) then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
  else
    if not edra_private.exam_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
    if p_opens_at >= p_closes_at or p_closes_at <= at then raise exception using errcode = 'P0001', message = 'validation'; end if;
    if target.opens_at is not null and at >= target.opens_at and p_opens_at <> target.opens_at then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
    if started and target.closes_at is not null and p_closes_at < target.closes_at then
      raise exception using errcode = 'P0001', message = 'window_locked';
    end if;
  end if;

  update public.exams set opens_at = p_opens_at, closes_at = p_closes_at,
    actual_closes_at = p_closes_at + interval '2 minutes',
    availability_updated_by = actor, availability_updated_at = at,
    version = version + 1, updated_by = actor, updated_at = at
  where id = target.id;
  return edra_private.exam_json(target.id);
end;
$$;

create or replace function edra_private.settle_exam_record(p_target public.exams, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  attempt public.exam_attempts%rowtype;
  work public.exam_work%rowtype;
  cutoff timestamptz;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = p_target.id and a.annual_student_record_id = p_record_id;
  if not found or attempt.finalized_at is not null or attempt.superseded_at is not null then return; end if;
  work := edra_private.lock_exam_work(p_target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a where a.id = attempt.id for update;
  t_now := clock_timestamp();
  cutoff := least(attempt.deadline_at, least(p_target.actual_closes_at,p_target.offering_closed_at));
  if attempt.finalized_at is not null or attempt.superseded_at is not null or cutoff is null or t_now < cutoff then return; end if;
  if work.accepted_submission_id is not null then
    update public.exam_attempts set superseded_at = t_now where id = attempt.id;
    return;
  end if;
  perform edra_private.accept_exam_submission(p_target, p_record_id, 'online',
    case when least(p_target.actual_closes_at,p_target.offering_closed_at) is null or attempt.deadline_at <= least(p_target.actual_closes_at,p_target.offering_closed_at)
      then 'timer' else 'window_closed' end::public.exam_finalization_reason,
    cutoff, t_now);
end;
$$;

create or replace function edra_private.settle_exam_attempts(p_target public.exams)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  due record;
  settled integer := 0;
begin
  for due in
    select a.annual_student_record_id from public.exam_attempts a
    where a.exam_id = p_target.id and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at, least(p_target.actual_closes_at,p_target.offering_closed_at)) <= clock_timestamp()
    order by a.annual_student_record_id
  loop
    perform edra_private.settle_exam_record(p_target, due.annual_student_record_id);
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;

create or replace function edra_private.settle_exam_closure(p_exam_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  settled integer;
  t_now timestamptz;
  qualifying record;
begin
  perform edra_private.offering_gate();
  -- Year share lock first (the lock order shared with year closure), then the exclusive exam lock.
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not found or least(target.actual_closes_at,target.offering_closed_at) is null then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id for share;
  select z.* into target from public.exams z where z.id = p_exam_id for update;
  if not found then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id and y.closed_at is null;
  if not found then return 0; end if;
  settled := edra_private.settle_exam_attempts(target);
  t_now := clock_timestamp();
  if t_now < least(target.actual_closes_at,target.offering_closed_at) then return settled; end if;
  insert into public.exam_closures (exam_id, academy_id, closed_at, settled_at)
  values (target.id, target.academy_id, least(target.actual_closes_at,target.offering_closed_at), t_now)
  on conflict do nothing;
  for qualifying in
    select w.annual_student_record_id from public.exam_work w
    where w.exam_id = target.id and w.solutions_qualified_at is null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
    order by w.annual_student_record_id
  loop
    perform 1 from public.exam_work w where w.exam_id = target.id and w.annual_student_record_id = qualifying.annual_student_record_id for update;
    perform edra_private.qualify_exam_solutions(target, qualifying.annual_student_record_id, t_now);
  end loop;
  return settled;
end;
$$;

create or replace function edra_private.exam_has_due_work(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exam_attempts a join public.exams z on z.id = a.exam_id
    where a.exam_id = p_exam_id and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) <= clock_timestamp()
  ) or exists (
    select 1 from public.exams z
    where z.id = p_exam_id and least(z.actual_closes_at,z.offering_closed_at) <= clock_timestamp()
      and not exists (select 1 from public.exam_closures c where c.exam_id = z.id)
  );
$$;

create or replace function edra_private.exam_student_state(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with numbered as (
    select q.id, row_number() over (order by p.position, q.position) as number
    from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = p_exam_id
  )
  select jsonb_build_object(
    'exam_id', z.id, 'title', z.title, 'instructions', z.instructions,
    'server_now', clock_timestamp(),
    'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', least(z.actual_closes_at,z.offering_closed_at),
    'time_limit_minutes', z.time_limit_minutes,
    'phase', edra_private.exam_phase(z, clock_timestamp()),
    'eligible', edra_private.exam_is_eligible(z.id, p_record_id),
    'excluded_question_ids', case when reveal.questions then coalesce((select jsonb_agg(x.id order by x.id) from public.exam_questions x where x.exam_id = z.id and x.excluded_at is not null), '[]'::jsonb) else '[]'::jsonb end,
    'parts', case when reveal.questions then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'position', pt.position, 'title', pt.title, 'instructions', pt.instructions, 'kind', pt.kind,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'position', qq.position, 'number', n.number, 'prompt', qq.prompt, 'max_score', qq.max_score::text,
            'excluded', qq.excluded_at is not null,
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label) order by c.position)
              from public.exam_choices c where c.question_id = qq.id), '[]'::jsonb)
          ) order by qq.position) from public.exam_questions qq join numbered n on n.id = qq.id where qq.part_id = pt.id
        ), '[]'::jsonb)
      ) order by pt.position) from public.exam_parts pt where pt.exam_id = z.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'attempt', (select jsonb_build_object(
        'started_at', a.started_at, 'deadline_at', a.deadline_at,
        'cutoff_at', least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)),
        'answers_version', a.answers_version, 'departure_count', a.departure_count,
        'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason, 'superseded', a.superseded_at is not null,
        'answers', case when reveal.questions then coalesce((select jsonb_agg(jsonb_build_object('question_id', o.question_id, 'choice_id', o.choice_id, 'text_answer', o.text_answer)
          order by o.question_id) from public.exam_online_answers o where o.attempt_id = a.id), '[]'::jsonb) else '[]'::jsonb end,
        'departures', case when reveal.questions then coalesce((select jsonb_agg(edra_private.exam_departure_json(d) order by d.ordinal)
          from public.exam_departures d where d.attempt_id = a.id), '[]'::jsonb) else '[]'::jsonb end
      ) from public.exam_attempts a where a.exam_id = z.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'processed_at', s.processed_at, 'original_deadline_at', s.original_deadline_at)
      from public.exam_work w join public.exam_submissions s on s.id = w.accepted_submission_id
      where w.exam_id = z.id and w.annual_student_record_id = p_record_id),
    'result', edra_private.exam_official_result_json(z.id, p_record_id),
    -- Solutions only once qualified: an accepted online submission at actual closure, or accepted
    -- physical work at actual closure with an announced result.
    'solutions', case when reveal.solutions then jsonb_build_object(
        'notes', z.solution_notes,
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'question_id', qq.id, 'model_answer', qq.model_answer,
            'correct_choice_id', (select c.id from public.exam_choices c where c.question_id = qq.id and c.is_correct)
          ) order by qq.id) from public.exam_questions qq where qq.exam_id = z.id), '[]'::jsonb)
      ) end
  )
  from public.exams z
  cross join lateral (select edra_private.exam_solutions_available(z, p_record_id, clock_timestamp()) as solutions) qualified
  cross join lateral (select qualified.solutions, qualified.solutions or exists (
    select 1 from public.exam_attempts a
    where a.exam_id = z.id and a.annual_student_record_id = p_record_id
      and a.finalized_at is null and a.superseded_at is null
  ) as questions) reveal
  where z.id = p_exam_id;
$$;

create or replace function edra_private.save_exam_answers_for(
  p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  if p_expected_version is null or p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) not between 1 and 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'answers', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  perform edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  t_now := clock_timestamp();
  -- Returned rather than raised so the settlement above commits.
  if attempt.finalized_at is not null or attempt.superseded_at is not null
    or t_now >= least(attempt.deadline_at, least(target.actual_closes_at,target.offering_closed_at)) then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.exam_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  -- Saving new answers needs current eligibility; settlement of already saved work does not.
  perform edra_private.require_exam_placement(target, p_record_id);
  if attempt.answers_version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'state', edra_private.exam_student_state(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.exam_answer_input (question_id uuid, choice_id uuid, text_answer text, has_text boolean) on commit drop;
  truncate pg_temp.exam_answer_input;
  begin
    insert into pg_temp.exam_answer_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid, e->>'text_answer', e ? 'text_answer'
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object'
      and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id', 'text_answer'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.exam_answer_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.exam_answer_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.exam_answer_input i where i.question_id is null or char_length(coalesce(i.text_answer, '')) > 10000) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- The answer shape must match the question kind; choices must belong to the question.
  if exists (
    select 1 from pg_temp.exam_answer_input i
    left join public.exam_questions q on q.id = i.question_id and q.exam_id = target.id
    left join public.exam_parts p on p.id = q.part_id
    where q.id is null
      or (p.kind = 'question_sheet' and (i.has_text or (i.choice_id is not null and not exists (
        select 1 from public.exam_choices c where c.question_id = q.id and c.id = i.choice_id))))
      or (p.kind = 'written_work' and i.choice_id is not null)
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;
  -- Excluded questions are skipped: a changed answer is rejected, an unchanged one is ignored.
  if exists (
    select 1 from pg_temp.exam_answer_input i
    join public.exam_questions q on q.id = i.question_id and q.excluded_at is not null
    left join public.exam_online_answers o on o.attempt_id = attempt.id and o.question_id = i.question_id
    where (o.choice_id, o.text_answer) is distinct from (i.choice_id, nullif(i.text_answer, ''))
  ) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
  end if;
  insert into public.exam_online_answers (attempt_id, academy_id, exam_id, question_id, choice_id, text_answer, saved_at)
  select attempt.id, target.academy_id, target.id, i.question_id, i.choice_id, nullif(i.text_answer, ''), t_now
  from pg_temp.exam_answer_input i
  join public.exam_questions q on q.id = i.question_id and q.excluded_at is null
  on conflict (attempt_id, question_id) do update set choice_id = excluded.choice_id, text_answer = excluded.text_answer, saved_at = excluded.saved_at;
  update public.exam_attempts set answers_version = answers_version + 1, last_saved_at = t_now where id = attempt.id;
  perform edra_private.mark_exam_activity(target, true);
  return edra_private.remember_exam_request(p_key, 'answers', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'state', edra_private.exam_student_state(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.record_exam_departure_for(p_exam_id uuid, p_record_id uuid, p_event_id uuid, p_question_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  attempt public.exam_attempts%rowtype;
  existing public.exam_departures%rowtype;
  recorded public.exam_departures%rowtype;
  current_number integer;
  next_question uuid;
  next_ordinal integer;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  if p_event_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  -- A due timer or closure wins over the departure.
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  -- A retried event returns its original outcome; reusing an event id for another question conflicts.
  select d.* into existing from public.exam_departures d where d.attempt_id = attempt.id and d.event_id = p_event_id;
  if found then
    if existing.question_id is distinct from p_question_id then raise exception using errcode = 'P0001', message = 'idempotency_conflict'; end if;
    return jsonb_build_object('outcome', 'duplicate', 'departure', edra_private.exam_departure_json(existing),
      'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  -- The question must belong to this exam.
  select n.number into current_number from (
    select q.id, row_number() over (order by p.position, q.position) as number
    from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = target.id
  ) n where n.id = p_question_id;
  if p_question_id is not null and current_number is null then raise exception using errcode = 'P0001', message = 'unknown_question'; end if;
  -- Returned rather than raised so a settlement above commits.
  if attempt.finalized_at is not null or attempt.superseded_at is not null then
    return jsonb_build_object('outcome', 'finalized', 'departure', null, 'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  t_now := clock_timestamp();
  if t_now >= least(attempt.deadline_at, least(target.actual_closes_at,target.offering_closed_at)) then
    perform edra_private.settle_exam_record(target, p_record_id);
    return jsonb_build_object('outcome', 'finalized', 'departure', null, 'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  next_ordinal := attempt.departure_count + 1;
  if next_ordinal < 3 then
    select n.id into next_question from (
      select q.id, q.excluded_at, row_number() over (order by p.position, q.position) as number
      from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = target.id
    ) n where n.number > coalesce(current_number, 0) and n.excluded_at is null
    order by n.number limit 1;
  end if;
  insert into public.exam_departures (
    attempt_id, event_id, academy_id, exam_id, ordinal, question_id, question_number, outcome, next_question_id, recorded_at
  ) values (
    attempt.id, p_event_id, target.academy_id, target.id, next_ordinal, p_question_id, current_number,
    case when next_ordinal >= 3 then 'kicked' else 'warned' end, next_question, t_now
  ) returning * into recorded;
  update public.exam_attempts set departure_count = next_ordinal where id = attempt.id;
  perform edra_private.mark_exam_activity(target, true);
  if next_ordinal >= 3 then
    if work.accepted_submission_id is null then
      perform edra_private.accept_exam_submission(target, p_record_id, 'online', 'kicked', t_now, t_now);
    end if;
    return jsonb_build_object('outcome', 'kicked', 'departure', edra_private.exam_departure_json(recorded),
      'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  return jsonb_build_object('outcome', 'warned', 'departure', edra_private.exam_departure_json(recorded),
    'state', edra_private.exam_student_state(target.id, p_record_id));
end;
$$;

create or replace function edra_private.save_exam_physical_draft(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  draft public.exam_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  perform edra_private.require_exam_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_answers is null
    or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'physical_draft', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.exam_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'answers', edra_private.exam_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_exam_placement(target, p_record_id);
  if least(target.actual_closes_at,target.offering_closed_at) is not null and t_now >= least(target.actual_closes_at,target.offering_closed_at) then raise exception using errcode = 'P0001', message = 'exam_closed'; end if;
  select d.* into draft from public.exam_physical_drafts d where d.exam_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'answers', edra_private.exam_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.exam_physical_input (question_id uuid, choice_id uuid) on commit drop;
  truncate pg_temp.exam_physical_input;
  begin
    insert into pg_temp.exam_physical_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object' and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.exam_physical_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.exam_physical_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.exam_physical_input i where i.question_id is null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (
    select 1 from pg_temp.exam_physical_input i
    left join public.exam_questions q on q.id = i.question_id and q.exam_id = target.id
    left join public.exam_parts p on p.id = q.part_id
    where q.id is null or p.kind <> 'question_sheet'
      or (i.choice_id is not null and not exists (select 1 from public.exam_choices c where c.question_id = q.id and c.id = i.choice_id))
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;

  if draft.exam_id is null then
    insert into public.exam_physical_drafts (exam_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  else
    update public.exam_physical_drafts set version = version + 1, updated_by = actor, updated_at = t_now
    where exam_id = target.id and annual_student_record_id = p_record_id;
  end if;
  delete from public.exam_physical_answers a where a.exam_id = target.id and a.annual_student_record_id = p_record_id
    and a.question_id not in (select i.question_id from pg_temp.exam_physical_input i);
  insert into public.exam_physical_answers (exam_id, annual_student_record_id, academy_id, question_id, choice_id)
  select target.id, p_record_id, target.academy_id, i.question_id, i.choice_id from pg_temp.exam_physical_input i
  on conflict (exam_id, annual_student_record_id, question_id) do update set choice_id = excluded.choice_id;
  if jsonb_array_length(p_answers) > 0 then perform edra_private.mark_exam_activity(target, true);
  else perform edra_private.mark_exam_activity(target, false); end if;
  return edra_private.remember_exam_request(p_key, 'physical_draft', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'answers', edra_private.exam_physical_answers_json(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.confirm_exam_physical(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  draft public.exam_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.offering_gate();
  perform edra_private.require_exam_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_key is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'confirm', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.exam_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  -- An online attempt already past its cutoff is finalized first, so it wins over a late confirmation.
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.exam_student_row(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_exam_placement(target, p_record_id);
  if least(target.actual_closes_at,target.offering_closed_at) is not null and t_now >= least(target.actual_closes_at,target.offering_closed_at) then raise exception using errcode = 'P0001', message = 'exam_closed'; end if;
  select d.* into draft from public.exam_physical_drafts d where d.exam_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'exam_conflict';
  end if;
  if draft.exam_id is null then
    insert into public.exam_physical_drafts (exam_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  end if;
  perform edra_private.accept_exam_submission(target, p_record_id, 'physical', 'physical', t_now, t_now);
  perform edra_private.mark_exam_activity(target, false);
  return edra_private.remember_exam_request(p_key, 'confirm', target, fingerprint,
    jsonb_build_object('outcome', 'confirmed', 'student', edra_private.exam_student_row(target.id, p_record_id)));
end;
$$;

create or replace function public.list_exams(
  p_academy_id uuid, p_academic_year_id uuid, p_search text, p_phase text, p_audience public.exam_audience,
  p_include_archived boolean, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
    or (p_phase is not null and p_phase <> all (array['preparing', 'ready', 'scheduled', 'open', 'headroom', 'closed', 'archived']))
    or char_length(coalesce(p_search, '')) > 200 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with base as (
    select z.*, edra_private.exam_phase(z, at_now) as phase from public.exams z
    where z.academy_id = p_academy_id
      and (p_academic_year_id is null or z.academic_year_id = p_academic_year_id)
      and (p_audience is null or z.audience = p_audience)
      and (coalesce(p_search, '') = '' or strpos(lower(z.title), lower(btrim(p_search))) > 0)
  ),
  filtered as (
    select b.* from base b
    where case when p_phase is not null then b.phase = p_phase else (p_include_archived or b.phase <> 'archived') end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'academic_year_id', f.academic_year_id, 'title', f.title, 'audience', f.audience,
        'level_id', f.level_id, 'track_id', f.track_id,
        'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.exam_audience_groups g where g.exam_id = f.id), '[]'::jsonb),
        'time_limit_minutes', f.time_limit_minutes, 'opens_at', f.opens_at, 'closes_at', f.closes_at, 'actual_closes_at', least(f.actual_closes_at,f.offering_closed_at),
        'max_score', f.max_score::text,
        'effective_max_score', coalesce((select sum(q.max_score) from public.exam_questions q where q.exam_id = f.id and q.excluded_at is null), 0)::text,
        'question_count', f.question_count, 'phase', f.phase, 'updated_at', f.updated_at,
        'submitted', (select count(*) from public.exam_work w where w.exam_id = f.id and w.accepted_submission_id is not null),
        'in_progress', (select count(*) from public.exam_attempts a where a.exam_id = f.id and a.finalized_at is null and a.superseded_at is null),
        'announced', (select count(*) from public.exam_work w where w.exam_id = f.id and w.published_revision > 0),
        'processing_pending', edra_private.exam_has_due_work(f.id),
        'closure_settled_at', (select c.settled_at from public.exam_closures c where c.exam_id = f.id)
      ) order by f.created_at desc, f.id)
      from (select * from filtered order by created_at desc, id limit p_limit offset p_offset) f
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

create or replace function edra_private.run_exam_deadlines(p_limit integer default 50)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  run_started timestamptz := clock_timestamp();
  due record;
  exam_count integer := 0;
  attempt_count integer := 0;
  failure_count integer := 0;
  last_error text;
  lag numeric;
begin
  for due in
    select candidates.exam_id from (
      select z.id as exam_id, least(z.actual_closes_at,z.offering_closed_at) as due_at from public.exams z
      where least(z.actual_closes_at,z.offering_closed_at) <= clock_timestamp() and not exists (select 1 from public.exam_closures c where c.exam_id = z.id)
      union all
      select a.exam_id, least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) from public.exam_attempts a
      join public.exams z on z.id = a.exam_id
      where a.finalized_at is null and a.superseded_at is null and least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) <= clock_timestamp()
    ) candidates
    join public.exams z on z.id = candidates.exam_id
    join public.academic_years y on y.id = z.academic_year_id and y.closed_at is null
    group by candidates.exam_id
    order by min(candidates.due_at), candidates.exam_id
    limit greatest(coalesce(p_limit, 50), 1)
  loop
    begin
      attempt_count := attempt_count + edra_private.settle_exam_closure(due.exam_id);
      exam_count := exam_count + 1;
    exception when others then
      failure_count := failure_count + 1;
      last_error := due.exam_id::text || ': ' || sqlerrm;
    end;
  end loop;
  select max(extract(epoch from s.processed_at - s.submitted_at)) into lag
  from public.exam_submissions s
  where s.processed_at >= run_started and s.source = 'online' and s.reason in ('timer', 'window_closed');
  insert into edra_private.exam_deadline_runs (started_at, finished_at, exams, attempts, failures, max_lag_seconds, error)
  values (run_started, clock_timestamp(), exam_count, attempt_count, failure_count, lag, last_error);
  -- Keep a week of run history.
  delete from edra_private.exam_deadline_runs where started_at < run_started - interval '7 days';
  return attempt_count;
end;
$$;

create or replace function edra_private.exam_deadline_health()
returns table (last_run_at timestamptz, runs_last_hour integer, failures_last_hour integer, max_lag_seconds_last_hour numeric, oldest_overdue_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select
    (select max(r.finished_at) from edra_private.exam_deadline_runs r),
    (select count(*)::integer from edra_private.exam_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select coalesce(sum(r.failures), 0)::integer from edra_private.exam_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(r.max_lag_seconds) from edra_private.exam_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(extract(epoch from clock_timestamp() - least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at))))
      from public.exam_attempts a join public.exams z on z.id = a.exam_id
      join public.academic_years y on y.id = z.academic_year_id and y.closed_at is null
      where a.finalized_at is null and a.superseded_at is null and least(a.deadline_at, least(z.actual_closes_at,z.offering_closed_at)) <= clock_timestamp());
$$;

create or replace function edra_private.quiz_solutions_available(
  p_target public.quizzes, p_record_id uuid, p_at timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select least(p_target.actual_closes_at,p_target.offering_closed_at) is not null and p_at >= least(p_target.actual_closes_at,p_target.offering_closed_at) and exists (
    select 1 from public.quiz_work w
    where w.quiz_id = p_target.id and w.annual_student_record_id = p_record_id
      and w.accepted_submission_id is not null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
  );
$$;

create or replace function edra_private.exam_solutions_available(
  p_target public.exams, p_record_id uuid, p_at timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select least(p_target.actual_closes_at,p_target.offering_closed_at) is not null and p_at >= least(p_target.actual_closes_at,p_target.offering_closed_at) and exists (
    select 1 from public.exam_work w
    where w.exam_id = p_target.id and w.annual_student_record_id = p_record_id
      and w.accepted_submission_id is not null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
  );
$$;

create or replace function edra_private.my_exam_action(p_exam public.exams, p_phase text, p_record_id uuid, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when a.id is not null and a.finalized_at is null and a.superseded_at is null
      and p_at < least(a.deadline_at, coalesce(least(p_exam.actual_closes_at,p_exam.offering_closed_at), a.deadline_at)) then
      case when p_exam.archived_at is null and edra_private.exam_is_eligible(p_exam.id, p_record_id) then 'resume' else 'ineligible' end
    when a.id is not null or w.accepted_submission_id is not null then 'submitted'
    when p_phase = 'archived' then 'unavailable'
    when p_phase = 'scheduled' then case when edra_private.exam_is_eligible(p_exam.id, p_record_id) then 'not_yet_open' else 'ineligible' end
    when p_phase = 'open' then case when edra_private.exam_is_eligible(p_exam.id, p_record_id) then 'start' else 'ineligible' end
    else 'no_new_starts'
  end
  from (select 1) one
  left join public.exam_attempts a on a.exam_id = p_exam.id and a.annual_student_record_id = p_record_id
  left join public.exam_work w on w.exam_id = p_exam.id and w.annual_student_record_id = p_record_id;
$$;

create or replace function edra_private.my_exam_overview_json(p_exam public.exams, p_phase text, p_record_id uuid, p_at timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exam_id', p_exam.id, 'title', p_exam.title, 'instructions', p_exam.instructions,
    'time_limit_minutes', p_exam.time_limit_minutes,
    'opens_at', p_exam.opens_at, 'closes_at', p_exam.closes_at, 'actual_closes_at', least(p_exam.actual_closes_at,p_exam.offering_closed_at),
    'server_now', p_at, 'phase', p_phase,
    'action', edra_private.my_exam_action(p_exam, p_phase, p_record_id, p_at),
    'attempt', (select jsonb_build_object(
        'started_at', a.started_at, 'deadline_at', a.deadline_at, 'cutoff_at', least(a.deadline_at, least(p_exam.actual_closes_at,p_exam.offering_closed_at)),
        'departure_count', a.departure_count, 'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason,
        'superseded', a.superseded_at is not null)
      from public.exam_attempts a where a.exam_id = p_exam.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'processed_at', s.processed_at)
      from public.exam_work w join public.exam_submissions s on s.id = w.accepted_submission_id
      where w.exam_id = p_exam.id and w.annual_student_record_id = p_record_id),
    'result', edra_private.exam_official_result_json(p_exam.id, p_record_id)
  );
$$;

create or replace function edra_private.exam_attempt_active(p_attempt public.exam_attempts, p_target public.exams)
returns boolean
language sql stable set search_path = '' as $$
  select p_attempt.finalized_at is null and p_attempt.superseded_at is null
    and clock_timestamp() < least(p_attempt.deadline_at, least(p_target.actual_closes_at,p_target.offering_closed_at));
$$;

create or replace function edra_private.exam_attempt_summary_json(p_attempt public.exam_attempts, p_target public.exams)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_attempt.id, 'started_at', p_attempt.started_at, 'deadline_at', p_attempt.deadline_at,
    'cutoff_at', least(p_attempt.deadline_at, least(p_target.actual_closes_at,p_target.offering_closed_at)),
    'departure_count', p_attempt.departure_count, 'answers_version', p_attempt.answers_version,
    'finalized_at', p_attempt.finalized_at, 'finalization_reason', p_attempt.finalization_reason,
    'superseded', p_attempt.superseded_at is not null
  );
$$;

create or replace function edra_private.exam_review_json(p_exam_id uuid, p_record_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  accepted public.exam_submissions%rowtype;
  base jsonb := jsonb_build_object('account_id', auth.uid(), 'server_now', at_now);
begin
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  select w.* into work from public.exam_work w where w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id;
  if work.accepted_submission_id is null then
    return base || jsonb_build_object('status', 'unavailable', 'reason', 'not_submitted');
  end if;
  if not edra_private.exam_solutions_available(target, p_record_id, at_now) then
    return base || jsonb_build_object('status', 'unavailable', 'reason',
      case when least(target.actual_closes_at,target.offering_closed_at) is null or at_now < least(target.actual_closes_at,target.offering_closed_at) then 'awaiting_closure' else 'awaiting_result' end);
  end if;
  select s.* into accepted from public.exam_submissions s
  where s.id = work.accepted_submission_id and s.exam_id = p_exam_id and s.annual_student_record_id = p_record_id;
  return base || jsonb_build_object(
    'status', 'available',
    'source', accepted.source,
    'notes', target.solution_notes,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'title', pt.title, 'instructions', pt.instructions, 'kind', pt.kind,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'number', n.number, 'prompt', q.prompt, 'excluded', q.excluded_at is not null,
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label) order by c.position)
              from public.exam_choices c where c.question_id = q.id), '[]'::jsonb),
            'answer', case
              when pt.kind = 'question_sheet' then
                case when sa.choice_id is not null then jsonb_build_object('state', 'choice', 'choice_id', sa.choice_id)
                  else jsonb_build_object('state', 'blank') end
              when accepted.source = 'physical' then jsonb_build_object('state', 'paper_work')
              when nullif(btrim(sa.text_answer), '') is not null then jsonb_build_object('state', 'text', 'text', sa.text_answer)
              else jsonb_build_object('state', 'blank')
            end,
            'correct_choice_id', (select c.id from public.exam_choices c where c.question_id = q.id and c.is_correct),
            'model_answer', q.model_answer
          ) order by q.position)
          from public.exam_questions q
          join (
            select x.id, row_number() over (order by xp.position, x.position) as number
            from public.exam_questions x join public.exam_parts xp on xp.id = x.part_id where x.exam_id = p_exam_id
          ) n on n.id = q.id
          left join public.exam_submission_answers sa on sa.submission_id = accepted.id and sa.question_id = q.id
          where q.part_id = pt.id
        ), '[]'::jsonb)
      ) order by pt.position)
      from public.exam_parts pt where pt.exam_id = p_exam_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function edra_private.offering_dependencies(p_academy uuid,p_level text,p_track uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t record; amount bigint; result jsonb:='{}';
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname not in ('academy_levels','global_levels')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='academy_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname=case when p_track is null then 'level_id' else 'track_id' end and not a.attisdropped)
    order by c.relname
  loop
    execute format('select count(*) from public.%I where academy_id=$1 and %I=$2::%s',t.relname,
      case when p_track is null then 'level_id' else 'track_id' end,
      case when p_track is null then 'text' else 'uuid' end)
      into amount using p_academy,case when p_track is null then p_level else p_track::text end;
    if amount>0 then result:=result||jsonb_build_object(t.relname,amount); end if;
  end loop;
  select count(*) into amount from public.student_import_sessions s where s.academy_id=p_academy
    and s.defaults->>case when p_track is null then 'level_id' else 'track_id' end=coalesce(p_track::text,p_level);
  if amount>0 then result:=result||jsonb_build_object('import_defaults',amount); end if;
  select count(*) into amount from public.student_import_rows r where r.academy_id=p_academy and
    (r.input->>case when p_track is null then 'level_id' else 'track_id' end=coalesce(p_track::text,p_level)
      or r.corrected->>case when p_track is null then 'level_id' else 'track_id' end=coalesce(p_track::text,p_level));
  if amount>0 then result:=result||jsonb_build_object('import_rows',amount); end if;
  return result;
end $$;

create or replace function edra_private.offering_impact(p_academy uuid,p_change jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l text:=p_change->>'levelId'; t uuid:=(p_change->>'trackId')::uuid; op text:=p_change->>'operation';
  y uuid; students bigint; groups_count bigint; schedules_count bigint; live bigint; attempts bigint;
  legacy_quizzes bigint; shared_count bigint; extra jsonb; preserved jsonb; dependencies jsonb; blockers jsonb:='{}'; changes jsonb:='{}';
begin
  perform edra_private.validate_offering_change(p_change);
  select id into y from public.academic_years where academy_id=p_academy and closed_at is null;
  dependencies:=edra_private.offering_dependencies(p_academy,l,case when op='remove_track' then t end);
  select count(*) into students from public.annual_student_records r where r.academy_id=p_academy
    and r.academic_year_id=y and r.level_id=l and (t is null or r.track_id=t) and r.archived_at is null;
  select count(*) into groups_count from public.groups g where g.academy_id=p_academy
    and g.academic_year_id=y and g.level_id=l and (t is null or g.track_id=t) and g.archived_at is null;
  select count(*) into schedules_count from public.schedules s left join public.groups g on g.id=s.group_id
    where s.academy_id=p_academy and s.academic_year_id=y and s.archived_at is null
      and coalesce(s.level_id,g.level_id)=l and (t is null or coalesce(s.track_id,g.track_id)=t);
  select count(*) into live from public.sessions s where s.academy_id=p_academy and s.academic_year_id=y
    and s.level_id=l and (t is null or s.track_id=t) and s.state='live' and s.auto_end_at>clock_timestamp();
  select count(*) into attempts from (
    select a.id from public.exam_attempts a join public.exams z on z.id=a.exam_id
    join public.annual_student_records r on r.id=a.annual_student_record_id
    where z.academy_id=p_academy and z.academic_year_id=y and (r.level_id=l or l in (select edra_private.assessment_levels('exam',z.id)))
      and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at,z.actual_closes_at)>clock_timestamp()
    union all
    select a.id from public.quiz_attempts a join public.quizzes z on z.id=a.quiz_id
    join public.annual_student_records r on r.id=a.annual_student_record_id
    where z.academy_id=p_academy and z.academic_year_id=y and (r.level_id=l or l in (select edra_private.assessment_levels('quiz',z.id)))
      and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at,z.actual_closes_at)>clock_timestamp()
  ) running;
  select count(*) into legacy_quizzes from public.quizzes q where q.academy_id=p_academy and q.academic_year_id=y
    and q.archived_at is null and (q.level_id=l and (t is null or q.track_id=t) or exists(
      select 1 from public.quiz_audience_groups x join public.groups g on g.id=x.group_id
      where x.quiz_id=q.id and g.level_id=l and (t is null or g.track_id=t)))
    and not exists(select 1 from public.content_assessments ca where ca.kind='quiz' and ca.assessment_id=q.id);

  select count(*) into shared_count from (
    select a.id from public.assignments a where a.academy_id=p_academy and a.academic_year_id=y and a.state='active'
      and l in (select edra_private.assessment_levels('assignment',a.id))
      and (select count(*) from edra_private.assessment_levels('assignment',a.id))>1
    union all
    select e.id from public.exams e where e.academy_id=p_academy and e.academic_year_id=y and e.archived_at is null
      and (least(e.actual_closes_at,e.offering_closed_at) is null or least(e.actual_closes_at,e.offering_closed_at)>clock_timestamp())
      and l in (select edra_private.assessment_levels('exam',e.id))
      and (select count(*) from edra_private.assessment_levels('exam',e.id))>1
  ) shared;
  if op='remove_level' then blockers:=dependencies;
  elsif op='stop_level' then
    if shared_count>0 then blockers:=blockers||jsonb_build_object('sharedAssessments',shared_count); end if;
    if live>0 then blockers:=blockers||jsonb_build_object('liveSessions',live); end if;
    if attempts>0 then blockers:=blockers||jsonb_build_object('runningAttempts',attempts); end if;
    if legacy_quizzes>0 then blockers:=blockers||jsonb_build_object('unattachedQuizzes',legacy_quizzes); end if;
  elsif op='remove_track' and legacy_quizzes>0 then blockers:=jsonb_build_object('unattachedQuizzes',legacy_quizzes);
  end if;
  changes:=jsonb_build_object('students',students,'groups',groups_count,'schedules',schedules_count,
    'liveSessions',live,'runningAttempts',attempts,'unattachedQuizzes',legacy_quizzes);

  extra:=jsonb_build_object(
    'assignments',(select count(*) from public.assignments a where a.academy_id=p_academy and a.academic_year_id=y and a.state='active' and (a.level_id=l and (t is null or a.track_id=t) or exists(select 1 from public.assignment_audience_groups x join public.groups g on g.id=x.group_id where x.assignment_id=a.id and g.level_id=l and (t is null or g.track_id=t)))),
    'exams',(select count(*) from public.exams e where e.academy_id=p_academy and e.academic_year_id=y and (e.level_id=l and (t is null or e.track_id=t) or exists(select 1 from public.exam_audience_groups x join public.groups g on g.id=x.group_id where x.exam_id=e.id and g.level_id=l and (t is null or g.track_id=t)))),
    'contentPrograms',(select count(*) from public.content_programs p where p.academy_id=p_academy and p.academic_year_id=y and p.level_id=l and (t is null or p.track_id=t)));
  changes:=changes||extra;
  preserved:=jsonb_build_object(
    'sessions',(select count(*) from public.sessions s where s.academy_id=p_academy and s.level_id=l and (t is null or s.track_id=t)),
    'archivedStudents',(select count(*) from public.annual_student_records r where r.academy_id=p_academy and r.level_id=l and (t is null or r.track_id=t) and (r.archived_at is not null or r.academic_year_id is distinct from y)),
    'closedAssignments',(select count(*) from public.assignments a where a.academy_id=p_academy and a.level_id=l and (t is null or a.track_id=t) and (a.state<>'active' or a.academic_year_id is distinct from y)));
  return jsonb_build_object('preserved',preserved,'change',p_change,'revision',coalesce((select revision from edra_private.offering_revisions where academy_id=p_academy),1),
    'fingerprint',md5((edra_private.offering_fingerprint(p_academy,p_change)||changes::text)::text),
    'changes',changes,'blockers',blockers,'dependencies',dependencies,'academicYearId',y);
end $$;
create or replace function edra_private.structure_json(p_academy uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('academyId',p_academy,'accountId',auth.uid(),'transitionsEnabled',coalesce((select enabled from edra_private.offering_release where singleton),false),'canManage',public.is_academy_manager(p_academy),
    'revision',coalesce((select revision from edra_private.offering_revisions where academy_id=p_academy),1),
    'levels',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.level_id,'name',g.name,'stoppedAt',l.stopped_at,'resumedAt',l.resumed_at,'version',l.version,
      'dependencies',edra_private.offering_dependencies(p_academy,l.level_id),
      'tracks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,
        'retiredAt',t.retired_at,'version',t.version) order by t.sort_order,t.id)
        from public.academy_tracks t where t.academy_id=p_academy and t.level_id=l.level_id),'[]'::jsonb)
      ) order by l.sort_order) from public.academy_levels l join public.global_levels g on g.id=l.level_id
      where l.academy_id=p_academy),'[]'::jsonb));
$$;

create or replace function public.maintain_academy_offering(p_academy_id uuid,p_change jsonb,
  p_expected_revision bigint,p_fingerprint text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_change->>'operation'; l text:=p_change->>'levelId'; t uuid:=(p_change->>'trackId')::uuid;
  payload jsonb; prior edra_private.offering_requests; impact jsonb; result jsonb; current_revision bigint;
begin
  -- EXCLUSIVE is always first; never upgrade a held SHARE barrier to EXCLUSIVE.
  perform pg_advisory_xact_lock(129,1);
  perform edra_private.structure_actor(p_academy_id,true);
  perform edra_private.validate_offering_change(p_change);
  if p_request_key is null or p_expected_revision is null or p_fingerprint is null then raise exception 'validation'; end if;
  payload:=jsonb_build_object('change',p_change,'revision',p_expected_revision,'fingerprint',p_fingerprint);
  select * into prior from edra_private.offering_requests where academy_id=p_academy_id
    and actor_id=auth.uid() and request_key=p_request_key;
  if found then
    if prior.payload<>payload then raise exception 'idempotency_conflict'; end if;
    return prior.result||jsonb_build_object('replayed',true);
  end if;
  insert into edra_private.offering_revisions(academy_id) values(p_academy_id) on conflict do nothing;
  select revision into current_revision from edra_private.offering_revisions where academy_id=p_academy_id for update;
  impact:=edra_private.offering_impact(p_academy_id,p_change);
  if current_revision<>p_expected_revision or impact->>'fingerprint'<>p_fingerprint then
    return jsonb_build_object('outcome','conflict','preview',impact);
  end if;
  if op in ('remove_track','remove_level','stop_level','resume_level') and not coalesce((select enabled from edra_private.offering_release where singleton),false) then raise exception 'transition_unavailable'; end if;
  if op<>'stop_level' and impact->'blockers'<>'{}'::jsonb then return jsonb_build_object('outcome','blocked','preview',impact); end if;
  if op='add_level' then
    if not exists(select 1 from public.global_levels where id=l and selectable) then raise exception 'validation'; end if;
    insert into public.academy_levels(academy_id,level_id,sort_order)
    select p_academy_id,l,coalesce(max(sort_order),0)+1 from public.academy_levels where academy_id=p_academy_id;
  elsif op='add_track' then
    perform edra_private.require_offering(p_academy_id,l);
    insert into public.academy_tracks(academy_id,level_id,name,sort_order)
    select p_academy_id,l,btrim(p_change->>'name'),coalesce(max(sort_order),-1)+1
    from public.academy_tracks where academy_id=p_academy_id and level_id=l returning id into t;
  elsif op='rename_track' then
    perform edra_private.require_offering(p_academy_id,l,t);
    update public.academy_tracks set name=btrim(p_change->>'name'),version=version+1
    where academy_id=p_academy_id and level_id=l and id=t;
    if not found then raise exception 'not_found'; end if;
  elsif op='remove_level' then
    delete from public.academy_levels where academy_id=p_academy_id and level_id=l;
    if not found then raise exception 'not_found'; end if;
  elsif op='resume_level' then
    update public.academy_levels set stopped_at=null,stopped_by=null,resumed_at=clock_timestamp(),
      resumed_by=auth.uid(),version=version+1 where academy_id=p_academy_id and level_id=l and stopped_at is not null;
    if not found then raise exception 'not_found'; end if;
  elsif op='remove_track' then
    perform edra_private.retire_offering_track(p_academy_id,l,t);
  elsif op='stop_level' then
    result:=edra_private.stop_offering_level(p_academy_id,l,p_change);
    if result is not null then return result; end if;
  else raise exception 'validation';
  end if;
  update edra_private.offering_revisions set revision=revision+1 where academy_id=p_academy_id;
  result:=jsonb_build_object('outcome','committed','trackId',t,'replayed',false,'structure',edra_private.structure_json(p_academy_id));
  insert into edra_private.offering_requests(academy_id,actor_id,request_key,payload,result)
  values(p_academy_id,auth.uid(),p_request_key,payload,result);
  return result;
end $$;

commit;
