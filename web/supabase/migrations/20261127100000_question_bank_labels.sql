begin;

-- Labels on saved questions, the fourth catalog of the shared academy labels. Organizational metadata:
-- applying or removing never edits the question, its memberships or assessment copies, and is allowed on
-- archived questions. The question bank stays manager-only, so the set command requires a manager. The
-- catalog starts empty.

alter table public.labels
  drop constraint labels_domain_check,
  add constraint labels_domain_check check (domain in ('assessments', 'content', 'students', 'questions'));

create table public.question_bank_question_labels (
  academy_id uuid not null,
  question_id uuid not null,
  label_id uuid not null,
  domain text not null generated always as ('questions'::text) stored,
  created_at timestamptz not null default now(),
  primary key (question_id, label_id),
  constraint question_bank_question_labels_question_fkey foreign key (academy_id, question_id) references public.question_bank_questions (academy_id, id) on delete cascade,
  constraint question_bank_question_labels_label_fkey foreign key (academy_id, domain, label_id) references public.labels (academy_id, domain, id) on delete cascade
);
create index question_bank_question_labels_label_idx on public.question_bank_question_labels (label_id);
create index question_bank_question_labels_academy_idx on public.question_bank_question_labels (academy_id);

alter table public.question_bank_question_labels enable row level security;
create policy question_bank_question_labels_select_manager on public.question_bank_question_labels for select to authenticated using (public.is_academy_manager(academy_id));
revoke all on table public.question_bank_question_labels from public, anon, authenticated;
grant select on table public.question_bank_question_labels to authenticated;

-- Applies or removes one label on explicit questions: the desired state, so retries and every other label
-- are preserved. All-or-nothing: one unknown question rejects the call. Returns how many associations changed.
create function public.set_question_bank_label(p_academy_id uuid, p_question_ids uuid[], p_label_id uuid, p_applied boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target_ids uuid[];
  matched integer;
  changed integer;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_question_ids is null or p_label_id is null or p_applied is null or array_position(p_question_ids, null::uuid) is not null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target_ids := array(select distinct target.id from unnest(p_question_ids) as target(id) order by target.id);
  if cardinality(target_ids) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- Share lock: waits for a deletion in progress and blocks one from starting until this commits.
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id and domain = 'questions' for share;
  if not found and p_applied then raise exception using errcode = 'P0001', message = 'label_not_found'; end if;
  select count(*) into matched from (
    select q.id from public.question_bank_questions q
    where q.academy_id = p_academy_id and q.id = any(target_ids) order by q.id for key share
  ) locked;
  if matched <> cardinality(target_ids) then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if p_applied then
    insert into public.question_bank_question_labels (academy_id, question_id, label_id)
    select p_academy_id, target.id, p_label_id from unnest(target_ids) as target(id) order by target.id
    on conflict do nothing;
  else
    delete from public.question_bank_question_labels where label_id = p_label_id and question_id = any(target_ids);
  end if;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.set_question_bank_label(uuid, uuid[], uuid, boolean) from public, anon;
grant execute on function public.set_question_bank_label(uuid, uuid[], uuid, boolean) to authenticated;

-- The same deletion, now also counting saved questions as uses. The row lock serializes this with every set command.
create or replace function public.delete_label(p_academy_id uuid, p_label_id uuid, p_confirmed boolean)
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
    + (select count(*) from public.exam_labels where label_id = p_label_id)
    + (select count(*) from public.content_unit_labels where label_id = p_label_id)
    + (select count(*) from public.annual_student_record_labels where label_id = p_label_id)
    + (select count(*) from public.question_bank_question_labels where label_id = p_label_id);
  if uses > 0 and not p_confirmed then return jsonb_build_object('status', 'confirm', 'uses', uses); end if;
  delete from public.labels where id = p_label_id and academy_id = p_academy_id;
  return jsonb_build_object('status', 'deleted', 'uses', uses);
end;
$$;

-- Rows and the detail gain their label IDs; nothing else changes.
create or replace function public.list_question_bank_questions(p_academy_id uuid, p_collection_id uuid, p_query text, p_offset integer, p_limit integer,
  p_archived boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_pattern text := '%' || replace(replace(replace(lower(btrim(coalesce(p_query,''))),'\','\\'),'%','\%'),'_','\_') || '%';
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if p_offset not between 0 and 100000 or p_limit not between 1 and 50 or char_length(coalesce(p_query,'')) > 200 then
    raise exception 'invalid_query';
  end if;
  return (
    with matches as (
      select q.id, q.academy_id, q.unit_id, q.created_at, q.payload->>'prompt' prompt, q.payload->>'printedNumber' printed_number,
        q.payload->'source'->>'file' file, (q.payload->'source'->>'page')::integer page,
        jsonb_array_length(q.payload->'choices') > 0 choice,
        case when jsonb_array_length(q.payload->'choices') > 0 then jsonb_typeof(q.payload->'answer') = 'string'
          else q.payload ? 'modelAnswer' end answered,
        jsonb_array_length(q.payload->'visuals') > 0 figures
      from public.question_bank_questions q
      where q.academy_id=p_academy_id and q.search_text like v_pattern
        and (q.archived_at is not null) = coalesce(p_archived,false)
        and (p_collection_id is null or exists (select 1 from public.question_bank_memberships m
          where m.academy_id=q.academy_id and m.collection_id=p_collection_id and m.question_id=q.id))
    ), page as (
      select * from matches
      order by lower(file), file, page, (substring(printed_number from '[0-9]+'))::numeric nulls last, printed_number, created_at, id
      offset p_offset limit p_limit
    )
    select jsonb_build_object('total',(select count(*) from matches),'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'unitId',p.unit_id,'prompt',p.prompt,'printedNumber',p.printed_number,'file',p.file,'page',p.page,'choice',p.choice,
      'answered',p.answered,'figures',p.figures,
      'collections',coalesce((select jsonb_agg(c.id order by c.kind desc, c.name_key) from public.question_bank_memberships m
        join public.question_bank_collections c on c.academy_id=m.academy_id and c.id=m.collection_id
        where m.academy_id=p.academy_id and m.question_id=p.id and c.kind in ('topic','custom')),'[]'::jsonb),
      'labels',coalesce((select jsonb_agg(l.label_id order by l.created_at, l.label_id) from public.question_bank_question_labels l
        where l.question_id=p.id),'[]'::jsonb)
    ) order by lower(p.file), p.file, p.page, (substring(p.printed_number from '[0-9]+'))::numeric nulls last, p.printed_number, p.created_at, p.id)
    from page p),'[]'::jsonb))
  );
end;
$$;

create or replace function public.get_question_bank_question(p_academy_id uuid, p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  return (select jsonb_build_object('id',q.id,'unitId',q.unit_id,'payload',q.payload,'archived',q.archived_at is not null,'collections',coalesce((
      select jsonb_agg(c.id order by c.kind,c.name_key) from public.question_bank_memberships m
      join public.question_bank_collections c on c.academy_id=m.academy_id and c.id=m.collection_id
      where m.academy_id=q.academy_id and m.question_id=q.id),'[]'::jsonb),
    'labels',coalesce((select jsonb_agg(l.label_id order by l.created_at, l.label_id) from public.question_bank_question_labels l
      where l.question_id=q.id),'[]'::jsonb))
    from public.question_bank_questions q where q.academy_id=p_academy_id and q.id=p_id);
end;
$$;

commit;
