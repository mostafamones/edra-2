-- Each module has its own label catalog: assessment labels are not offered on content units, nor the
-- reverse, and the same name may exist in both. Existing labels are assessment labels, including the
-- starter ones; the content catalog starts empty. A label's domain is fixed once created, and each
-- association table's foreign key includes its domain, so a link cannot cross catalogs.

alter table public.labels
  add column domain text not null default 'assessments' constraint labels_domain_check check (domain in ('assessments', 'content')),
  add constraint labels_academy_domain_id_key unique (academy_id, domain, id);
drop index public.labels_academy_name_key;
create unique index labels_academy_domain_name_key on public.labels (academy_id, domain, lower(name));

alter table public.assignment_labels
  add column domain text not null generated always as ('assessments'::text) stored,
  drop constraint assignment_labels_academy_id_label_id_fkey,
  add constraint assignment_labels_label_fkey foreign key (academy_id, domain, label_id) references public.labels (academy_id, domain, id) on delete cascade;
alter table public.quiz_labels
  add column domain text not null generated always as ('assessments'::text) stored,
  drop constraint quiz_labels_academy_id_label_id_fkey,
  add constraint quiz_labels_label_fkey foreign key (academy_id, domain, label_id) references public.labels (academy_id, domain, id) on delete cascade;
alter table public.exam_labels
  add column domain text not null generated always as ('assessments'::text) stored,
  drop constraint exam_labels_academy_id_label_id_fkey,
  add constraint exam_labels_label_fkey foreign key (academy_id, domain, label_id) references public.labels (academy_id, domain, id) on delete cascade;
alter table public.content_unit_labels
  add column domain text not null generated always as ('content'::text) stored,
  drop constraint content_unit_labels_academy_id_label_id_fkey,
  add constraint content_unit_labels_label_fkey foreign key (academy_id, domain, label_id) references public.labels (academy_id, domain, id) on delete cascade;

-- The starter labels' conflict target follows the new index; new academies would otherwise fail to create.
create or replace function edra_private.add_default_labels(p_academy_id uuid)
returns void
language sql security definer set search_path = '' as $$
  insert into public.labels (id, academy_id, domain, name, color)
  select gen_random_uuid(), p_academy_id, 'assessments', defaults.name, defaults.color
  from (values ('Online only', 'blue'), ('Ready for in-person', 'green'), ('Needs review', 'amber')) as defaults(name, color)
  on conflict (academy_id, domain, lower(name)) do nothing;
$$;

-- p_domain defaults so code deployed before this migration keeps creating assessment labels.
drop function public.create_label(uuid, uuid, text, text);
create function public.create_label(p_academy_id uuid, p_label_id uuid, p_name text, p_color text, p_domain text default 'assessments')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.labels;
  created public.labels;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_label_id is null or p_name is null or p_color is null or p_domain is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select * into existing from public.labels where id = p_label_id;
  if found then
    if existing.academy_id = p_academy_id and existing.domain = p_domain and existing.name = btrim(p_name) and existing.color = p_color then
      return edra_private.label_json(existing);
    end if;
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    insert into public.labels (id, academy_id, domain, name, color) values (p_label_id, p_academy_id, p_domain, btrim(p_name), p_color)
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
revoke all on function public.create_label(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_label(uuid, uuid, text, text, text) to authenticated;

-- The same commands, now finding labels only in their own catalog.
create or replace function public.set_assessment_label(p_academy_id uuid, p_type text, p_assessment_id uuid, p_label_id uuid, p_applied boolean)
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
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id and domain = 'assessments' for share;
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

create or replace function public.set_content_unit_label(p_academy_id uuid, p_unit_id uuid, p_label_id uuid, p_applied boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_label_role(p_academy_id, false);
  if p_unit_id is null or p_label_id is null or p_applied is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if not exists (select 1 from public.content_units where id = p_unit_id and academy_id = p_academy_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Share lock: waits for a deletion in progress and blocks one from starting until this commits.
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id and domain = 'content' for share;
  if not found and p_applied then raise exception using errcode = 'P0001', message = 'label_not_found'; end if;
  if p_applied then
    insert into public.content_unit_labels (academy_id, unit_id, label_id) values (p_academy_id, p_unit_id, p_label_id) on conflict do nothing;
  else
    delete from public.content_unit_labels where unit_id = p_unit_id and label_id = p_label_id;
  end if;
  return coalesce((select jsonb_agg(l.label_id order by l.label_id) from public.content_unit_labels l where l.unit_id = p_unit_id), '[]'::jsonb);
end;
$$;
