-- Resolve the quiz relation explicitly and authorize availability edits before resource reads.
begin;

create or replace function edra_private.assessment_levels(p_kind text,p_id uuid)
returns setof text language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
  if p_kind not in ('assignment','quiz','exam') then raise exception 'validation'; end if;
  execute format('select to_jsonb(a) from public.%I a where id=$1',case when p_kind='quiz' then 'quizzes' else p_kind||'s' end) into a using p_id;
  if a->>'audience'='groups' then
    return query execute format('select distinct g.level_id from public.%I x join public.groups g on g.id=x.group_id where x.%I=$1',p_kind||'_audience_groups',p_kind||'_id') using p_id;
  elsif a->>'level_id' is not null then return next a->>'level_id'; end if;
end $$;

create or replace function edra_private.require_assessment_offering(p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a jsonb; g record;
begin
  if p_kind not in ('assignment','quiz','exam') then raise exception 'validation'; end if;
  execute format('select to_jsonb(a) from public.%I a where id=$1',case when p_kind='quiz' then 'quizzes' else p_kind||'s' end) into a using p_id;
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
  perform edra_private.offering_gate();
  perform edra_private.require_quiz_role(p_academy_id, true);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, true);
  perform edra_private.require_assessment_offering('quiz',p_quiz_id);
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
  perform edra_private.offering_gate();
  perform edra_private.require_exam_role(p_academy_id, true);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, true);
  perform edra_private.require_assessment_offering('exam',p_exam_id);
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

commit;
