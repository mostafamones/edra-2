begin;

alter table public.content_access_grants drop constraint content_access_grants_kind_check;
alter table public.content_access_grants add constraint content_access_grants_kind_check
  check(kind in ('staff','code','staff_extension','student_extension','attendance'));

-- One immutable outcome per original qualifying effect/taught unit. No historical replay.
create table edra_private.attendance_learning_outcomes (
  effect_id uuid not null references public.attendance_effects(id),
  unit_id uuid not null,
  content_revision integer not null,
  grant_id uuid references public.content_access_grants(id),
  outcome text not null check(outcome in ('granted','preserved','content_unavailable','year_closed','student_unavailable','prerequisites_required')),
  starts_at timestamptz not null,
  expires_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(effect_id,unit_id),
  foreign key(unit_id,content_revision) references public.content_revisions(unit_id,revision),
  check((outcome in ('granted','preserved'))=(grant_id is not null))
);
alter table edra_private.attendance_learning_outcomes enable row level security;
revoke all on edra_private.attendance_learning_outcomes from public,anon,authenticated,service_role;
create trigger attendance_learning_history before update or delete on edra_private.attendance_learning_outcomes
  for each row execute function edra_private.content_access_immutable();

-- Internal-only exception to synthetic delivery suppression. Archive suppression always wins.
-- Generic claim/pending functions and all external delivery guards stay unchanged.
create function edra_private.claim_attendance_learning(p_effect uuid) returns public.attendance_effects
language plpgsql security definer set search_path='' as $$
declare effect public.attendance_effects;
begin
  effect:=edra_private.claim_attendance_effect(p_effect);
  if effect.id is not null then
    if effect.effect_type='explanation_access' then return effect; end if;
    return null;
  end if;
  select * into effect from public.attendance_effects where id=p_effect and effect_type='explanation_access';
  if not found then return null; end if;
  perform 1 from public.sessions where id=effect.session_id and archived_at is null for share;
  if not found then return null; end if;
  select e.* into effect from public.attendance_effects e where e.id=p_effect for update skip locked;
  if not found or effect.processed_at is not null
    or exists(select 1 from public.attendance_effect_suppressions s where s.effect_id=p_effect)
    or not exists(select 1 from edra_private.dev_effect_suppressions d
      join edra_private.dev_runs r on r.id=d.run_id and r.academy_id=effect.academy_id
      where d.source_table='attendance_effects' and d.effect_id=p_effect)
    then return null; end if;
  return effect;
end $$;

create function edra_private.consume_attendance_learning(p_effect uuid) returns void
language plpgsql security definer set search_path='' as $$
declare effect public.attendance_effects; publication public.attendance_publications;
  taught record; scope jsonb; student public.annual_student_records; profile public.academy_student_profiles;
  previous public.content_access_grants; outcome text; grant_id uuid; starts timestamptz; expires timestamptz; seconds bigint;
begin
  effect:=edra_private.claim_attendance_learning(p_effect);
  if effect.id is null then return; end if;
  -- An optional empty taught list has nothing to dispatch (also true of generated seed history).
  if not exists(select 1 from public.session_taught_content where session_id=effect.session_id) then return; end if;
  select * into strict publication from public.attendance_publications where id=effect.publication_id;
  if not exists(select 1 from public.attendance_publication_items i where i.publication_id=effect.publication_id
    and i.annual_student_record_id=effect.annual_student_record_id and i.status in ('present','late'))
    then raise exception 'invalid_attendance_learning_source'; end if;
  starts:=publication.published_at;
  for taught in select * from public.session_taught_content where session_id=effect.session_id order by unit_id loop
    if exists(select 1 from edra_private.attendance_learning_outcomes o where o.effect_id=p_effect and o.unit_id=taught.unit_id) then continue; end if;
    outcome:='granted'; grant_id:=null; expires:=null;
    -- Expected eligibility failures are durable outcomes; unexpected errors roll back finalization.
    begin
      scope:=edra_private.learning_publication(effect.academy_id,taught.unit_id);
      if (scope->>'year')::uuid<>effect.academic_year_id then raise exception 'student_unavailable'; end if;
      select * into student from public.annual_student_records where id=effect.annual_student_record_id
        and academy_id=effect.academy_id and academic_year_id=effect.academic_year_id for share;
      if not found then raise exception 'student_unavailable'; end if;
      select * into strict profile from public.academy_student_profiles where id=student.academy_student_profile_id for share;
      -- Annual-record access may precede account linking; actual retrieval still requires student authority.
      if edra_private.student_access_suspended(student,profile) or student.level_id<>scope->>'level'
        or (scope->>'track' is not null and student.track_id is distinct from (scope->>'track')::uuid)
        then raise exception 'student_unavailable'; end if;
      if not edra_private.content_offering_available(taught.unit_id,student.id) then raise exception 'content_unavailable'; end if;
      seconds:=coalesce((scope->'document'->>'accessDays')::bigint,7)*86400;
      expires:=starts+make_interval(secs=>seconds::double precision);
      insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id)
        values(effect.academy_id,effect.academic_year_id,student.id,taught.unit_id) on conflict do nothing;
      perform 1 from public.content_access_accounts where annual_record_id=student.id and unit_id=taught.unit_id for update;
      select g.* into previous from public.content_access_grants g join public.content_access_accounts a on a.current_grant_id=g.id
        where a.annual_record_id=student.id and a.unit_id=taught.unit_id;
      if previous.id is not null and previous.expires_at>=expires
        and not exists(select 1 from public.content_access_revocations where content_access_revocations.grant_id=previous.id) then
        outcome:='preserved'; grant_id:=previous.id; expires:=previous.expires_at;
      else
        -- The existing grant trigger applies the same prerequisite invariant to every source.
        grant_id:=gen_random_uuid();
        insert into public.content_access_grants(id,academy_id,academic_year_id,annual_record_id,unit_id,kind,actor_id,
          issued_at,previous_grant_id,previous_expiry,starts_at,expires_at,duration_seconds)
        values(grant_id,effect.academy_id,effect.academic_year_id,student.id,taught.unit_id,'attendance',publication.published_by,
          clock_timestamp(),previous.id,previous.expires_at,starts,expires,seconds);
        update public.content_access_accounts set current_grant_id=grant_id where annual_record_id=student.id and unit_id=taught.unit_id;
      end if;
    exception when raise_exception then
      if sqlerrm not in ('content_unavailable','year_closed','student_unavailable','prerequisites_required') then raise; end if;
      outcome:=sqlerrm; grant_id:=null; expires:=null;
    end;
    insert into edra_private.attendance_learning_outcomes(effect_id,unit_id,content_revision,grant_id,outcome,starts_at,expires_at)
      values(p_effect,taught.unit_id,taught.content_revision,grant_id,outcome,starts,expires);
  end loop;
  update public.attendance_effects set processed_at=clock_timestamp() where id=p_effect;
end $$;

-- Statement trigger runs after synthetic row suppressions. Stable record ordering avoids
-- two simultaneous sessions acquiring shared student/unit account locks in opposite order.
create function edra_private.attendance_learning_inserted() returns trigger
language plpgsql security definer set search_path='' as $$
declare effect record;
begin
  for effect in select id from attendance_new_effects where effect_type='explanation_access'
    order by annual_student_record_id,session_id,id loop
    perform edra_private.consume_attendance_learning(effect.id);
  end loop;
  return null;
end $$;
create trigger attendance_learning_inserted after insert on public.attendance_effects
  referencing new table as attendance_new_effects for each statement execute function edra_private.attendance_learning_inserted();

revoke all on function edra_private.claim_attendance_learning(uuid),edra_private.consume_attendance_learning(uuid),
  edra_private.attendance_learning_inserted() from public,anon,authenticated,service_role;

commit;
