begin;

-- Library search reads a compact lowered text instead of detoasting payloads that carry images.
alter table public.question_bank_questions add column search_text text generated always as (lower(
  coalesce(payload->>'prompt','') || ' ' || coalesce(payload->>'modelAnswer','') || ' ' || coalesce(payload->>'printedNumber','')
  || ' ' || jsonb_path_query_array(payload,'$.choices[*].text')::text
)) stored;

-- Collections organize saved questions without copying them. Source evidence stays in each payload.
create table public.question_bank_collections (
  academy_id uuid not null references public.academies(id),
  id uuid not null,
  kind text not null check (kind in ('topic','source_document','source_section','custom')),
  parent_id uuid,
  parent_kind text generated always as (case when parent_id is not null then 'source_document' end) stored,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  name_key text generated always as (lower(regexp_replace(btrim(name),'\s+',' ','g'))) stored,
  first_page integer check (first_page > 0),
  last_page integer,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (academy_id,id),
  unique (academy_id,id,kind),
  -- A section belongs to exactly one source document of the same academy; nothing else has a parent.
  foreign key (academy_id,parent_id,parent_kind) references public.question_bank_collections(academy_id,id,kind),
  check ((kind = 'source_section') = (parent_id is not null)),
  check ((kind = 'source_section') = (first_page is not null and last_page is not null) and (last_page is null or last_page >= first_page)),
  check (kind not in ('topic','custom') or char_length(btrim(name)) <= 120)
);
-- Topics and custom collections are chosen by name; documents are not (same filename ≠ same document).
create unique index question_bank_collection_names on public.question_bank_collections(academy_id,kind,name_key)
  where kind in ('topic','custom');
-- Repeated headings in one document stay distinct by the page where each section starts.
create unique index question_bank_sections on public.question_bank_collections(academy_id,parent_id,name_key,first_page)
  where kind = 'source_section';

create table public.question_bank_memberships (
  academy_id uuid not null,
  collection_id uuid not null,
  question_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (academy_id,collection_id,question_id),
  foreign key (academy_id,collection_id) references public.question_bank_collections(academy_id,id),
  foreign key (academy_id,question_id) references public.question_bank_questions(academy_id,id)
);
create index question_bank_memberships_question on public.question_bank_memberships(academy_id,question_id);

alter table public.question_bank_collections enable row level security;
alter table public.question_bank_memberships enable row level security;
revoke all on public.question_bank_collections, public.question_bank_memberships from public, anon, authenticated;
grant select on public.question_bank_collections, public.question_bank_memberships to authenticated;
create policy question_bank_collections_manager_read on public.question_bank_collections for select to authenticated
  using (public.is_academy_manager(academy_id));
create policy question_bank_memberships_manager_read on public.question_bank_memberships for select to authenticated
  using (public.is_academy_manager(academy_id));

create function public.get_question_bank_collections(p_academy_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.question_bank_questions q where q.academy_id=p_academy_id),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'name',c.name,'parentId',c.parent_id,'firstPage',c.first_page,
        'count',(select count(*) from public.question_bank_memberships m where m.academy_id=c.academy_id and m.collection_id=c.id))
        order by c.kind, c.parent_id nulls first, c.first_page nulls first, c.name_key, c.id)
      from public.question_bank_collections c where c.academy_id=p_academy_id
    ),'[]'::jsonb));
end;
$$;

-- Server-side search and collection filtering across the whole authorized library.
create function public.list_question_bank_questions(p_academy_id uuid, p_collection_id uuid, p_query text, p_offset integer, p_limit integer)
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
      select q.id, q.unit_id, q.created_at, q.payload->>'prompt' prompt, q.payload->>'printedNumber' printed_number,
        q.payload->'source'->>'file' file, (q.payload->'source'->>'page')::integer page,
        jsonb_array_length(q.payload->'choices') > 0 choice
      from public.question_bank_questions q
      where q.academy_id=p_academy_id and q.search_text like v_pattern
        and (p_collection_id is null or exists (select 1 from public.question_bank_memberships m
          where m.academy_id=q.academy_id and m.collection_id=p_collection_id and m.question_id=q.id))
    ), page as (select * from matches order by created_at desc, id desc offset p_offset limit p_limit)
    select jsonb_build_object('total',(select count(*) from matches),'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'unitId',unit_id,'prompt',prompt,'printedNumber',printed_number,'file',file,'page',page,'choice',choice
    ) order by created_at desc, id desc) from page),'[]'::jsonb))
  );
end;
$$;

create function public.get_question_bank_question(p_academy_id uuid, p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  return (select jsonb_build_object('id',q.id,'unitId',q.unit_id,'payload',q.payload,'collections',coalesce((
      select jsonb_agg(c.id order by c.kind,c.name_key) from public.question_bank_memberships m
      join public.question_bank_collections c on c.academy_id=m.academy_id and c.id=m.collection_id
      where m.academy_id=q.academy_id and m.question_id=q.id),'[]'::jsonb))
    from public.question_bank_questions q where q.academy_id=p_academy_id and q.id=p_id);
end;
$$;

create function public.create_question_bank_collection(p_academy_id uuid, p_id uuid, p_kind text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if p_kind not in ('topic','custom') or char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'invalid_collection'; end if;
  begin
    insert into public.question_bank_collections(academy_id,id,kind,name,created_by)
    values(p_academy_id,p_id,p_kind,btrim(p_name),auth.uid()) on conflict (academy_id,id) do nothing;
  exception when unique_violation then raise exception 'duplicate_name';
  end;
  -- A retried create succeeds; a reused ID for something else does not.
  if not exists (select 1 from public.question_bank_collections c where c.academy_id=p_academy_id and c.id=p_id and c.kind=p_kind
    and c.name_key=lower(regexp_replace(btrim(p_name),'\s+',' ','g'))) then raise exception 'collection_conflict'; end if;
  return p_id;
end;
$$;

create function public.rename_question_bank_collection(p_academy_id uuid, p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'invalid_collection'; end if;
  begin
    update public.question_bank_collections set name=btrim(p_name)
    where academy_id=p_academy_id and id=p_id and kind in ('topic','custom');
  exception when unique_violation then raise exception 'duplicate_name';
  end;
  if not found then raise exception 'invalid_collection'; end if;
end;
$$;

-- Only organizational memberships change here; source memberships and questions are never removed.
create function public.set_question_bank_memberships(p_academy_id uuid, p_collection_id uuid, p_question_ids uuid[], p_member boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_question_ids),0) not between 1 and 100 or p_member is null then raise exception 'invalid_questions'; end if;
  perform 1 from public.question_bank_collections c where c.academy_id=p_academy_id and c.id=p_collection_id
    and c.kind in ('topic','custom') for share;
  if not found then raise exception 'invalid_collection'; end if;
  if (select count(*) from public.question_bank_questions q where q.academy_id=p_academy_id and q.id = any(p_question_ids))
    <> (select count(distinct id) from unnest(p_question_ids) id) then raise exception 'invalid_questions'; end if;
  if p_member then
    insert into public.question_bank_memberships(academy_id,collection_id,question_id,created_by)
    select distinct p_academy_id,p_collection_id,id,auth.uid() from unnest(p_question_ids) id
    on conflict do nothing;
  else
    delete from public.question_bank_memberships m where m.academy_id=p_academy_id and m.collection_id=p_collection_id
      and m.question_id = any(p_question_ids);
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Saves reviewed questions and their automatic source memberships in one transaction. Identical
-- retries are idempotent: questions, document, sections, topics and memberships are all reused.
create function public.save_question_bank_import(p_academy_id uuid, p_questions jsonb, p_document jsonb,
  p_program_id uuid default null, p_collection_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
  v_document uuid := (p_document->>'id')::uuid;
  v_item jsonb;
  v_question uuid;
  v_page integer;
  v_section uuid;
  v_name text;
  v_key text;
  v_first integer;
  v_topic text;
  v_topic_id uuid;
begin
  -- Authorizes, validates and inserts the questions (with the existing identical-retry check).
  v_count := public.save_question_bank_questions(p_academy_id,p_questions,p_program_id);
  if v_document is null or char_length(btrim(coalesce(p_document->>'name',''))) not between 1 and 255 then raise exception 'invalid_document'; end if;
  insert into public.question_bank_collections(academy_id,id,kind,name,created_by)
  values(p_academy_id,v_document,'source_document',btrim(p_document->>'name'),v_actor) on conflict (academy_id,id) do nothing;
  perform 1 from public.question_bank_collections c where c.academy_id=p_academy_id and c.id=v_document and c.kind='source_document' for share;
  if not found then raise exception 'invalid_document'; end if;
  if p_collection_id is not null then
    perform 1 from public.question_bank_collections c where c.academy_id=p_academy_id and c.id=p_collection_id and c.kind='custom' for share;
    if not found then raise exception 'invalid_collection'; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_questions) order by value->>'id' loop
    v_question := (v_item->>'id')::uuid;
    v_page := (v_item->'payload'->'source'->>'page')::integer;
    insert into public.question_bank_memberships(academy_id,collection_id,question_id,created_by)
    values(p_academy_id,v_document,v_question,v_actor) on conflict do nothing;
    if p_collection_id is not null then
      insert into public.question_bank_memberships(academy_id,collection_id,question_id,created_by)
      values(p_academy_id,p_collection_id,v_question,v_actor) on conflict do nothing;
    end if;

    if jsonb_typeof(v_item->'section') = 'object' then
      v_name := btrim(coalesce(v_item->'section'->>'name',''));
      v_first := (v_item->'section'->>'firstPage')::integer;
      if char_length(v_name) not between 1 and 150 or v_first is null or v_first < 1 or v_page is null or v_page < v_first then
        raise exception 'invalid_section';
      end if;
      v_key := lower(regexp_replace(v_name,'\s+',' ','g'));
      v_section := null;
      select c.id into v_section from public.question_bank_collections c where c.academy_id=p_academy_id and c.parent_id=v_document
        and c.kind='source_section' and c.name_key=v_key and c.first_page=v_first;
      -- A run at the start of a later page range continues only an adjacent section of the same heading.
      if v_section is null and coalesce((v_item->'section'->>'continues')::boolean,false) then
        select c.id into v_section from public.question_bank_collections c where c.academy_id=p_academy_id and c.parent_id=v_document
          and c.kind='source_section' and c.name_key=v_key and c.first_page < v_first and c.last_page >= v_first - 1
          order by c.first_page desc limit 1;
      end if;
      if v_section is null then
        insert into public.question_bank_collections(academy_id,id,kind,parent_id,name,first_page,last_page,created_by)
        values(p_academy_id,gen_random_uuid(),'source_section',v_document,v_name,v_first,v_page,v_actor)
        on conflict (academy_id,parent_id,name_key,first_page) where kind = 'source_section' do nothing returning id into v_section;
        if v_section is null then
          select c.id into v_section from public.question_bank_collections c where c.academy_id=p_academy_id and c.parent_id=v_document
            and c.kind='source_section' and c.name_key=v_key and c.first_page=v_first;
        end if;
      end if;
      update public.question_bank_collections c set last_page=v_page where c.academy_id=p_academy_id and c.id=v_section and c.last_page < v_page;
      insert into public.question_bank_memberships(academy_id,collection_id,question_id,created_by)
      values(p_academy_id,v_section,v_question,v_actor) on conflict do nothing;
    elsif v_item ? 'section' and jsonb_typeof(v_item->'section') <> 'null' then raise exception 'invalid_section';
    end if;

    if v_item ? 'topics' and (jsonb_typeof(v_item->'topics') <> 'array' or jsonb_array_length(v_item->'topics') > 12) then
      raise exception 'invalid_topics';
    end if;
    for v_topic in select btrim(value) from jsonb_array_elements_text(coalesce(v_item->'topics','[]'::jsonb)) loop
      if char_length(v_topic) not between 1 and 120 then raise exception 'invalid_topics'; end if;
      v_key := lower(regexp_replace(v_topic,'\s+',' ','g'));
      insert into public.question_bank_collections(academy_id,id,kind,name,created_by)
      values(p_academy_id,gen_random_uuid(),'topic',v_topic,v_actor)
      on conflict (academy_id,kind,name_key) where kind in ('topic','custom') do nothing;
      select c.id into v_topic_id from public.question_bank_collections c
        where c.academy_id=p_academy_id and c.kind='topic' and c.name_key=v_key;
      insert into public.question_bank_memberships(academy_id,collection_id,question_id,created_by)
      values(p_academy_id,v_topic_id,v_question,v_actor) on conflict do nothing;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Saves now go through the import command so source memberships are never skipped.
revoke all on function public.save_question_bank_questions(uuid,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.get_question_bank_collections(uuid) from public, anon, authenticated;
revoke all on function public.list_question_bank_questions(uuid,uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.get_question_bank_question(uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_question_bank_collection(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.rename_question_bank_collection(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.set_question_bank_memberships(uuid,uuid,uuid[],boolean) from public, anon, authenticated;
revoke all on function public.save_question_bank_import(uuid,jsonb,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_question_bank_collections(uuid) to authenticated;
grant execute on function public.list_question_bank_questions(uuid,uuid,text,integer,integer) to authenticated;
grant execute on function public.get_question_bank_question(uuid,uuid) to authenticated;
grant execute on function public.create_question_bank_collection(uuid,uuid,text,text) to authenticated;
grant execute on function public.rename_question_bank_collection(uuid,uuid,text) to authenticated;
grant execute on function public.set_question_bank_memberships(uuid,uuid,uuid[],boolean) to authenticated;
grant execute on function public.save_question_bank_import(uuid,jsonb,jsonb,uuid,uuid) to authenticated;

commit;
