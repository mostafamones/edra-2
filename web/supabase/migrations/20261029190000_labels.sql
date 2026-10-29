-- Shared academy labels. One staff-only catalog per academy, independent of academic years and of
-- the modules using it. Assignments, quizzes and exams are the first targets, each with its own
-- association table and real foreign keys. Labels are organizational metadata: applying or removing
-- them never touches assessment versions, preparation, audience, availability, work, marks or
-- results, and is allowed on archived assessments and in closed years.
--
-- Writes go only through the commands below (no table write grants). Every active staff member may
-- apply/remove labels; only Owner, Head Admin and Admin manage definitions. Applying takes a share
-- lock on the label and deletion an exclusive one, so a label that gains a use while deletion runs
-- is never removed without confirmation.

create table public.labels (
  id uuid primary key,
  academy_id uuid not null references public.academies (id) on delete cascade,
  name text not null constraint labels_name_check check (name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
  -- Keys of the central palette (web/src/lib/palette.ts); the colors themselves live there.
  color text not null constraint labels_color_check check (color in ('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink')),
  created_at timestamptz not null default now(),
  unique (academy_id, id)
);
create unique index labels_academy_name_key on public.labels (academy_id, lower(name));

create table public.assignment_labels (
  academy_id uuid not null,
  assignment_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (assignment_id, label_id),
  foreign key (academy_id, assignment_id) references public.assignments (academy_id, id) on delete cascade,
  foreign key (academy_id, label_id) references public.labels (academy_id, id) on delete cascade
);
create table public.quiz_labels (
  academy_id uuid not null,
  quiz_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (quiz_id, label_id),
  foreign key (academy_id, quiz_id) references public.quizzes (academy_id, id) on delete cascade,
  foreign key (academy_id, label_id) references public.labels (academy_id, id) on delete cascade
);
create table public.exam_labels (
  academy_id uuid not null,
  exam_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (exam_id, label_id),
  foreign key (academy_id, exam_id) references public.exams (academy_id, id) on delete cascade,
  foreign key (academy_id, label_id) references public.labels (academy_id, id) on delete cascade
);
create index assignment_labels_label_idx on public.assignment_labels (label_id);
create index quiz_labels_label_idx on public.quiz_labels (label_id);
create index exam_labels_label_idx on public.exam_labels (label_id);

-- Staff-only reads; students, parents and other academies see nothing.
alter table public.labels enable row level security;
alter table public.assignment_labels enable row level security;
alter table public.quiz_labels enable row level security;
alter table public.exam_labels enable row level security;
create policy labels_select_staff on public.labels for select to authenticated using (public.is_academy_member(academy_id));
create policy assignment_labels_select_staff on public.assignment_labels for select to authenticated using (public.is_academy_member(academy_id));
create policy quiz_labels_select_staff on public.quiz_labels for select to authenticated using (public.is_academy_member(academy_id));
create policy exam_labels_select_staff on public.exam_labels for select to authenticated using (public.is_academy_member(academy_id));
revoke all on table public.labels, public.assignment_labels, public.quiz_labels, public.exam_labels from public, anon, authenticated;
grant select on table public.labels, public.assignment_labels, public.quiz_labels, public.exam_labels to authenticated;

-- The caller's live role, or `forbidden`: unauthenticated, not staff here, suspended, or not a manager when required.
create function edra_private.require_label_role(p_academy_id uuid, p_managers_only boolean)
returns public.academy_role
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_role public.academy_role := public.academy_role_for(p_academy_id);
begin
  if auth.uid() is null or p_academy_id is null or caller_role is null
    or (p_managers_only and caller_role not in ('owner', 'head_admin', 'admin')) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return caller_role;
end;
$$;

create function edra_private.label_json(p_label public.labels)
returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', p_label.id, 'name', p_label.name, 'color', p_label.color);
$$;

-- Creates a label with a caller-chosen ID, so a retried request returns the label it created.
create function public.create_label(p_academy_id uuid, p_label_id uuid, p_name text, p_color text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.labels;
  created public.labels;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_label_id is null or p_name is null or p_color is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select * into existing from public.labels where id = p_label_id;
  if found then
    if existing.academy_id = p_academy_id and existing.name = btrim(p_name) and existing.color = p_color then
      return edra_private.label_json(existing);
    end if;
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    insert into public.labels (id, academy_id, name, color) values (p_label_id, p_academy_id, btrim(p_name), p_color)
    returning * into created;
  exception
    when unique_violation then
      if exists (select 1 from public.labels where id = p_label_id) then raise exception using errcode = 'P0001', message = 'validation'; end if;
      raise exception using errcode = 'P0001', message = 'duplicate_name';
    when check_violation then raise exception using errcode = 'P0001', message = 'validation';
  end;
  return edra_private.label_json(created);
end;
$$;

-- Sets the name and color (the desired state; repeating it changes nothing). Updates every use.
create function public.update_label(p_academy_id uuid, p_label_id uuid, p_name text, p_color text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  updated public.labels;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_label_id is null or p_name is null or p_color is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    update public.labels set name = btrim(p_name), color = p_color
    where id = p_label_id and academy_id = p_academy_id
    returning * into updated;
  exception
    when unique_violation then raise exception using errcode = 'P0001', message = 'duplicate_name';
    when check_violation then raise exception using errcode = 'P0001', message = 'validation';
  end;
  if updated.id is null then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return edra_private.label_json(updated);
end;
$$;

-- Deletes a label and every association in one statement, never the labelled records. A used label
-- (any assessment type, year or state) needs p_confirmed; without it nothing changes and the
-- authoritative use count comes back. The row lock serializes this with set_assessment_label.
-- Deleting a label that is already gone succeeds, so retries are safe.
create function public.delete_label(p_academy_id uuid, p_label_id uuid, p_confirmed boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uses integer;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_label_id is null or p_confirmed is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id for update;
  if not found then return jsonb_build_object('status', 'deleted', 'uses', 0); end if;
  uses := (select count(*) from public.assignment_labels where label_id = p_label_id)
    + (select count(*) from public.quiz_labels where label_id = p_label_id)
    + (select count(*) from public.exam_labels where label_id = p_label_id);
  if uses > 0 and not p_confirmed then return jsonb_build_object('status', 'confirm', 'uses', uses); end if;
  delete from public.labels where id = p_label_id and academy_id = p_academy_id;
  return jsonb_build_object('status', 'deleted', 'uses', uses);
end;
$$;

-- Applies or removes one label on one assessment: the desired state, not a toggle, so retries and
-- other staff members' concurrent changes to other labels are preserved. Any active staff member,
-- including on archived assessments and in closed years. Returns the assessment's label IDs.
create function public.set_assessment_label(p_academy_id uuid, p_type text, p_assessment_id uuid, p_label_id uuid, p_applied boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_label_role(p_academy_id, false);
  if p_type is null or p_type <> all (array['assignment', 'quiz', 'exam']) or p_assessment_id is null or p_label_id is null or p_applied is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if (p_type = 'assignment' and not exists (select 1 from public.assignments where id = p_assessment_id and academy_id = p_academy_id))
    or (p_type = 'quiz' and not exists (select 1 from public.quizzes where id = p_assessment_id and academy_id = p_academy_id))
    or (p_type = 'exam' and not exists (select 1 from public.exams where id = p_assessment_id and academy_id = p_academy_id)) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Share lock: waits for a deletion in progress and blocks one from starting until this commits.
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id for share;
  if not found and p_applied then raise exception using errcode = 'P0001', message = 'label_not_found'; end if;
  if p_applied then
    if p_type = 'assignment' then
      insert into public.assignment_labels (academy_id, assignment_id, label_id) values (p_academy_id, p_assessment_id, p_label_id) on conflict do nothing;
    elsif p_type = 'quiz' then
      insert into public.quiz_labels (academy_id, quiz_id, label_id) values (p_academy_id, p_assessment_id, p_label_id) on conflict do nothing;
    else
      insert into public.exam_labels (academy_id, exam_id, label_id) values (p_academy_id, p_assessment_id, p_label_id) on conflict do nothing;
    end if;
  elsif p_type = 'assignment' then
    delete from public.assignment_labels where assignment_id = p_assessment_id and label_id = p_label_id;
  elsif p_type = 'quiz' then
    delete from public.quiz_labels where quiz_id = p_assessment_id and label_id = p_label_id;
  else
    delete from public.exam_labels where exam_id = p_assessment_id and label_id = p_label_id;
  end if;
  return coalesce((select jsonb_agg(l.label_id order by l.label_id) from (
    select label_id from public.assignment_labels where p_type = 'assignment' and assignment_id = p_assessment_id
    union all select label_id from public.quiz_labels where p_type = 'quiz' and quiz_id = p_assessment_id
    union all select label_id from public.exam_labels where p_type = 'exam' and exam_id = p_assessment_id) l), '[]'::jsonb);
end;
$$;

revoke all on function edra_private.require_label_role(uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.label_json(public.labels) from public, anon, authenticated;
revoke all on function public.create_label(uuid, uuid, text, text) from public, anon;
revoke all on function public.update_label(uuid, uuid, text, text) from public, anon;
revoke all on function public.delete_label(uuid, uuid, boolean) from public, anon;
revoke all on function public.set_assessment_label(uuid, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.create_label(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_label(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_label(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_assessment_label(uuid, text, uuid, uuid, boolean) to authenticated;

-- Staff Assessments list: each row's labels, and label filtering (any selected label, or Unlabeled)
-- applied in the database before totals, order and paging. Authority, counts and order unchanged.

drop function public.list_assessments(uuid, uuid, text[], text, text, text, uuid, uuid, text[], text, text, integer, integer);

create function public.list_assessments(
  p_academy_id uuid, p_academic_year_id uuid, p_types text[], p_search text, p_audience text,
  p_level_id text, p_track_id uuid, p_group_id uuid,
  p_statuses text[], p_sort text, p_group text, p_limit integer, p_offset integer,
  p_label_ids uuid[] default null, p_unlabeled boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  any_label boolean := cardinality(coalesce(p_label_ids, '{}')) > 0;
  needle text := lower(btrim(coalesce(p_search, '')));
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
    or p_types is null or cardinality(p_types) = 0 or not (p_types <@ array['assignment', 'quiz', 'exam'])
    or (p_audience is not null and p_audience <> all (array['level', 'program', 'groups']))
    or p_sort is null or p_sort <> all (array['newest', 'title'])
    or p_statuses is null or not (p_statuses <@ array[
      'assignment:active', 'assignment:closed', 'assignment:archived',
      'quiz:preparing', 'quiz:ready', 'quiz:scheduled', 'quiz:open', 'quiz:headroom', 'quiz:closed', 'quiz:archived',
      'exam:preparing', 'exam:ready', 'exam:scheduled', 'exam:open', 'exam:headroom', 'exam:closed', 'exam:archived'])
    or p_group is null or p_group <> all (array['none', 'type', 'status'])
    or char_length(coalesce(p_search, '')) > 200 or char_length(coalesce(p_level_id, '')) > 40
    -- Unlabeled is an alternative to named labels, never combined with them.
    or p_unlabeled is null or cardinality(coalesce(p_label_ids, '{}')) > 100
    or (p_unlabeled and cardinality(coalesce(p_label_ids, '{}')) > 0) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with items as (
    select 'assignment'::text as type, a.id, a.title, a.academic_year_id, a.audience::text as audience, a.level_id, a.track_id,
      a.state::text as status, a.due_at, null::timestamptz as opens_at, null::timestamptz as closes_at, a.created_at
    from public.assignments a
    where 'assignment' = any(p_types) and a.academy_id = p_academy_id
      and (p_academic_year_id is null or a.academic_year_id = p_academic_year_id)
      and (p_audience is null or a.audience::text = p_audience or (p_audience = 'program' and a.audience::text = 'level'))
      and (needle = '' or strpos(lower(a.title), needle) > 0)
      -- A level matches program audiences of that level and group audiences with a group in it.
      and (p_level_id is null or a.level_id = p_level_id or exists (select 1 from public.assignment_audience_groups l join public.groups g on g.id = l.group_id
        where l.assignment_id = a.id and g.level_id = p_level_id))
      and (p_track_id is null or a.track_id = p_track_id)
      and (p_group_id is null or exists (select 1 from public.assignment_audience_groups l where l.assignment_id = a.id and l.group_id = p_group_id))
      -- Any selected label matches; EXISTS keeps one row per assessment however many labels match.
      and (not any_label or exists (select 1 from public.assignment_labels l where l.assignment_id = a.id and l.label_id = any(p_label_ids)))
      and (not p_unlabeled or not exists (select 1 from public.assignment_labels l where l.assignment_id = a.id))
    union all
    select 'quiz', z.id, z.title, z.academic_year_id, z.audience::text, z.level_id, z.track_id,
      edra_private.quiz_phase(z, at_now), null, z.opens_at, z.closes_at, z.created_at
    from public.quizzes z
    where 'quiz' = any(p_types) and z.academy_id = p_academy_id
      and (p_academic_year_id is null or z.academic_year_id = p_academic_year_id)
      and (p_audience is null or z.audience::text = p_audience or (p_audience = 'program' and z.audience::text = 'level'))
      and (needle = '' or strpos(lower(z.title), needle) > 0)
      -- A level matches program audiences of that level and group audiences with a group in it.
      and (p_level_id is null or z.level_id = p_level_id or exists (select 1 from public.quiz_audience_groups l join public.groups g on g.id = l.group_id
        where l.quiz_id = z.id and g.level_id = p_level_id))
      and (p_track_id is null or z.track_id = p_track_id)
      and (p_group_id is null or exists (select 1 from public.quiz_audience_groups l where l.quiz_id = z.id and l.group_id = p_group_id))
      -- Any selected label matches; EXISTS keeps one row per assessment however many labels match.
      and (not any_label or exists (select 1 from public.quiz_labels l where l.quiz_id = z.id and l.label_id = any(p_label_ids)))
      and (not p_unlabeled or not exists (select 1 from public.quiz_labels l where l.quiz_id = z.id))
    union all
    select 'exam', x.id, x.title, x.academic_year_id, x.audience::text, x.level_id, x.track_id,
      edra_private.exam_phase(x, at_now), null, x.opens_at, x.closes_at, x.created_at
    from public.exams x
    where 'exam' = any(p_types) and x.academy_id = p_academy_id
      and (p_academic_year_id is null or x.academic_year_id = p_academic_year_id)
      and (p_audience is null or x.audience::text = p_audience or (p_audience = 'program' and x.audience::text = 'level'))
      and (needle = '' or strpos(lower(x.title), needle) > 0)
      -- A level matches program audiences of that level and group audiences with a group in it.
      and (p_level_id is null or x.level_id = p_level_id or exists (select 1 from public.exam_audience_groups l join public.groups g on g.id = l.group_id
        where l.exam_id = x.id and g.level_id = p_level_id))
      and (p_track_id is null or x.track_id = p_track_id)
      and (p_group_id is null or exists (select 1 from public.exam_audience_groups l where l.exam_id = x.id and l.group_id = p_group_id))
      -- Any selected label matches; EXISTS keeps one row per assessment however many labels match.
      and (not any_label or exists (select 1 from public.exam_labels l where l.exam_id = x.id and l.label_id = any(p_label_ids)))
      and (not p_unlabeled or not exists (select 1 from public.exam_labels l where l.exam_id = x.id))
  ),
  filtered as (
    select i.* from items i where i.type || ':' || i.status = any(p_statuses)
  ),
  page as (
    select f.*, row_number() over (order by
      -- Groups stay contiguous across pages: by type, or by status word across every type.
      case when p_group = 'type' then array_position(array['assignment', 'quiz', 'exam'], f.type) end,
      case when p_group = 'status' then array_position(array['preparing', 'ready', 'scheduled', 'open', 'headroom', 'active', 'closed', 'archived'], f.status) end,
      case when p_sort = 'title' then lower(f.title) end, case when p_sort = 'title' then f.title end,
      f.created_at desc, f.type, f.id) as position
    from filtered f
    order by position
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', p.type, 'id', p.id, 'title', p.title, 'academic_year_id', p.academic_year_id, 'audience', p.audience,
        'level_id', p.level_id, 'track_id', p.track_id,
        'group_ids', coalesce(case p.type
          when 'assignment' then (select jsonb_agg(g.group_id order by g.group_id) from public.assignment_audience_groups g where g.assignment_id = p.id)
          when 'quiz' then (select jsonb_agg(g.group_id order by g.group_id) from public.quiz_audience_groups g where g.quiz_id = p.id)
          else (select jsonb_agg(g.group_id order by g.group_id) from public.exam_audience_groups g where g.exam_id = p.id)
        end, '[]'::jsonb),
        'labels', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'color', b.color) order by lower(b.name), b.id)
          from public.labels b where b.id in (
            select l.label_id from public.assignment_labels l where p.type = 'assignment' and l.assignment_id = p.id
            union all select l.label_id from public.quiz_labels l where p.type = 'quiz' and l.quiz_id = p.id
            union all select l.label_id from public.exam_labels l where p.type = 'exam' and l.exam_id = p.id)), '[]'::jsonb),
        'status', p.status, 'due_at', p.due_at, 'opens_at', p.opens_at, 'closes_at', p.closes_at, 'created_at', p.created_at,
        -- The same maxima the per-type lists show: assignment max_score, quiz/exam total of non-excluded questions.
        'max_score', (case p.type
          when 'assignment' then (select a.max_score from public.assignments a where a.id = p.id)
          when 'quiz' then coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = p.id and q.excluded_at is null), 0)
          else coalesce((select sum(q.max_score) from public.exam_questions q where q.exam_id = p.id and q.excluded_at is null), 0)
        end)::text,
        -- The workspace counts: students with every part/question marked, of the assessment's audience
        -- (assignments: active required cohort plus optional eligible; quizzes/exams: current eligible students).
        'marked_count', case p.type
          when 'assignment' then (select count(*) from public.assignment_recipients x where x.assignment_id = p.id
            and not exists (select 1 from public.assignment_parts pt where pt.assignment_id = p.id
              and not edra_private.assignment_part_complete(p.id, x.annual_student_record_id, pt.id)))
          when 'quiz' then (select count(*) from public.quiz_work w where w.quiz_id = p.id and w.accepted_submission_id is not null
            and (edra_private.quiz_result_content(p.id, w.annual_student_record_id)->>'complete')::boolean)
          else (select count(*) from public.exam_work w where w.exam_id = p.id and w.accepted_submission_id is not null
            and (edra_private.exam_result_content(p.id, w.annual_student_record_id)->>'complete')::boolean)
        end,
        'audience_count', case p.type
          when 'assignment' then (select (c->>'current_required_count')::integer + (c->>'optional_eligible_count')::integer
            from edra_private.assignment_cohort_context(p.id) c)
          when 'quiz' then (select count(*) from edra_private.quiz_audience_records(p.id))
          else (select count(*) from edra_private.exam_audience_records(p.id))
        end,
        'parts', coalesce(case p.type
          when 'assignment' then (select jsonb_agg(jsonb_build_object('title', x.title, 'kind', x.kind) order by x.position) from public.assignment_parts x where x.assignment_id = p.id)
          when 'quiz' then (select jsonb_agg(jsonb_build_object('title', x.title, 'kind', x.kind) order by x.position) from public.quiz_parts x where x.quiz_id = p.id)
          else (select jsonb_agg(jsonb_build_object('title', x.title, 'kind', x.kind) order by x.position) from public.exam_parts x where x.exam_id = p.id)
        end, '[]'::jsonb),
        'processing_pending', case p.type
          when 'quiz' then edra_private.quiz_has_due_work(p.id)
          when 'exam' then edra_private.exam_has_due_work(p.id)
          else false
        end
      ) order by p.position)
      from page p
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

revoke all on function public.list_assessments(uuid, uuid, text[], text, text, text, uuid, uuid, text[], text, text, integer, integer, uuid[], boolean) from public, anon;
grant execute on function public.list_assessments(uuid, uuid, text[], text, text, text, uuid, uuid, text[], text, text, integer, integer, uuid[], boolean) to authenticated;
