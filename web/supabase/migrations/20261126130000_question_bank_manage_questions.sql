begin;

-- Archived questions leave the library, counts and the assessment picker but keep their content and memberships.
alter table public.question_bank_questions add column archived_at timestamptz;

-- The list gains an archive scope and returns organizational memberships and answer state for each row.
drop function public.list_question_bank_questions(uuid,uuid,text,integer,integer);
create function public.list_question_bank_questions(p_academy_id uuid, p_collection_id uuid, p_query text, p_offset integer, p_limit integer,
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
        where m.academy_id=p.academy_id and m.question_id=p.id and c.kind in ('topic','custom')),'[]'::jsonb)
    ) order by lower(p.file), p.file, p.page, (substring(p.printed_number from '[0-9]+'))::numeric nulls last, p.printed_number, p.created_at, p.id)
    from page p),'[]'::jsonb))
  );
end;
$$;

-- Counts cover active questions only; archived questions are counted separately.
create or replace function public.get_question_bank_collections(p_academy_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.question_bank_questions q where q.academy_id=p_academy_id and q.archived_at is null),
    'archived', (select count(*) from public.question_bank_questions q where q.academy_id=p_academy_id and q.archived_at is not null),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'name',c.name,'parentId',c.parent_id,'firstPage',c.first_page,
        'count',(select count(*) from public.question_bank_memberships m join public.question_bank_questions q
          on q.academy_id=m.academy_id and q.id=m.question_id and q.archived_at is null
          where m.academy_id=c.academy_id and m.collection_id=c.id))
        order by c.kind, c.parent_id nulls first, c.first_page nulls first, c.name_key, c.id)
      from public.question_bank_collections c where c.academy_id=p_academy_id
    ),'[]'::jsonb));
end;
$$;

create or replace function public.get_question_bank_question(p_academy_id uuid, p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  return (select jsonb_build_object('id',q.id,'unitId',q.unit_id,'payload',q.payload,'archived',q.archived_at is not null,'collections',coalesce((
      select jsonb_agg(c.id order by c.kind,c.name_key) from public.question_bank_memberships m
      join public.question_bank_collections c on c.academy_id=m.academy_id and c.id=m.collection_id
      where m.academy_id=q.academy_id and m.question_id=q.id),'[]'::jsonb))
    from public.question_bank_questions q where q.academy_id=p_academy_id and q.id=p_id);
end;
$$;

-- Edits the prompt, choice texts, confirmed answer and written model answer. Choice keys, source evidence,
-- visuals and memberships are unchanged; assessment copies made earlier are independent and unaffected.
create function public.update_question_bank_question(p_academy_id uuid, p_id uuid, p_changes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_choices jsonb := p_changes->'choices';
  v_answer jsonb := coalesce(p_changes->'answer','null'::jsonb);
  v_model text := btrim(coalesce(p_changes->>'modelAnswer',''));
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  select q.payload into v_old from public.question_bank_questions q where q.academy_id=p_academy_id and q.id=p_id for update;
  if not found then raise exception 'invalid_questions'; end if;
  if jsonb_typeof(p_changes->'prompt') <> 'string' or char_length(btrim(p_changes->>'prompt')) not between 1 and 10000
    or jsonb_typeof(v_choices) <> 'array'
    or (select coalesce(jsonb_agg(c->'key' order by n),'[]'::jsonb) from jsonb_array_elements(v_choices) with ordinality t(c,n))
      <> (select coalesce(jsonb_agg(c->'key' order by n),'[]'::jsonb) from jsonb_array_elements(v_old->'choices') with ordinality t(c,n))
    or exists(select 1 from jsonb_array_elements(v_choices) c where jsonb_typeof(c->'text') <> 'string'
      or char_length(btrim(c->>'text')) not between 1 and 2000)
    or (jsonb_typeof(v_answer) <> 'null' and not exists(select 1 from jsonb_array_elements(v_choices) c where c->'key' = v_answer))
    or char_length(v_model) > 10000 or (v_model <> '' and jsonb_array_length(v_choices) > 0)
  then raise exception 'invalid_question'; end if;
  update public.question_bank_questions q set payload = (v_old - 'modelAnswer')
    || jsonb_build_object('prompt',btrim(p_changes->>'prompt'),
      'choices',coalesce((select jsonb_agg(jsonb_build_object('key',c->'key','text',btrim(c->>'text')) order by n)
        from jsonb_array_elements(v_choices) with ordinality t(c,n)),'[]'::jsonb),
      'answer',v_answer)
    || case when v_model <> '' then jsonb_build_object('modelAnswer',v_model) else '{}'::jsonb end
  where q.academy_id=p_academy_id and q.id=p_id;
end;
$$;

create function public.set_question_bank_archived(p_academy_id uuid, p_question_ids uuid[], p_archived boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_question_ids),0) not between 1 and 100 or p_archived is null then raise exception 'invalid_questions'; end if;
  if (select count(*) from public.question_bank_questions q where q.academy_id=p_academy_id and q.id = any(p_question_ids))
    <> (select count(distinct id) from unnest(p_question_ids) id) then raise exception 'invalid_questions'; end if;
  update public.question_bank_questions q set archived_at = case when p_archived then coalesce(q.archived_at, now()) end
  where q.academy_id=p_academy_id and q.id = any(p_question_ids) and (q.archived_at is not null) <> p_archived;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Permanently removes questions and their memberships. Assessment copies are independent and stay.
create function public.delete_question_bank_questions(p_academy_id uuid, p_question_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_question_ids),0) not between 1 and 100 then raise exception 'invalid_questions'; end if;
  delete from public.question_bank_memberships m where m.academy_id=p_academy_id and m.question_id = any(p_question_ids);
  delete from public.question_bank_questions q where q.academy_id=p_academy_id and q.id = any(p_question_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.list_question_bank_questions(uuid,uuid,text,integer,integer,boolean) from public, anon, authenticated;
revoke all on function public.update_question_bank_question(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.set_question_bank_archived(uuid,uuid[],boolean) from public, anon, authenticated;
revoke all on function public.delete_question_bank_questions(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.list_question_bank_questions(uuid,uuid,text,integer,integer,boolean) to authenticated;
grant execute on function public.update_question_bank_question(uuid,uuid,jsonb) to authenticated;
grant execute on function public.set_question_bank_archived(uuid,uuid[],boolean) to authenticated;
grant execute on function public.delete_question_bank_questions(uuid,uuid[]) to authenticated;

commit;
