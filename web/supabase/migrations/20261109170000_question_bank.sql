begin;

create table public.question_bank_questions (
  academy_id uuid not null references public.academies(id),
  id uuid not null,
  program_id uuid,
  unit_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  payload jsonb not null,
  primary key (academy_id,id),
  foreign key (academy_id,program_id) references public.content_programs(academy_id,id),
  foreign key (academy_id,unit_id) references public.content_units(academy_id,id) on delete set null (unit_id),
  check (unit_id is null or program_id is not null),
  check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 750000
    and coalesce(jsonb_typeof(payload->'prompt') = 'string' and char_length(btrim(payload->>'prompt')) between 1 and 10000, false)
    and coalesce(jsonb_typeof(payload->'choices') = 'array' and jsonb_typeof(payload->'visuals') = 'array'
      and jsonb_typeof(payload->'source') = 'object', false))
);
create index question_bank_recent on public.question_bank_questions(academy_id,created_at desc,id desc);
create index question_bank_link on public.question_bank_questions(academy_id,unit_id) where unit_id is not null;
alter table public.question_bank_questions enable row level security;
revoke all on public.question_bank_questions from public, anon, authenticated;
grant select on public.question_bank_questions to authenticated;
create policy question_bank_manager_read on public.question_bank_questions for select to authenticated
  using (public.is_academy_manager(academy_id));

-- Compact catalog only: do not send Library metadata to the extraction provider.
create function public.get_question_bank_units(p_academy_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'year', y.start_year, 'grade', g.name,
      'track', coalesce(t.name,p.original_track_name),
      'units', coalesce((
        select jsonb_agg(jsonb_build_object('id',u.id,'title',u.draft->>'title','state',u.state,
          'labels',coalesce((
            select jsonb_agg(l.name order by l.name) from public.content_unit_labels ul
            join public.labels l on l.academy_id=ul.academy_id and l.id=ul.label_id and l.domain='content'
            where ul.academy_id=u.academy_id and ul.unit_id=u.id
          ),'[]'::jsonb)) order by u.draft->>'title',u.id)
        from public.content_units u where u.academy_id=p.academy_id and u.program_id=p.id and u.state<>'archived'
      ),'[]'::jsonb)
    ) order by y.start_year desc,g.name,t.name,p.id)
    from public.content_programs p
    join public.academic_years y on y.academy_id=p.academy_id and y.id=p.academic_year_id
    join public.global_levels g on g.id=p.level_id
    left join public.academy_tracks t on t.academy_id=p.academy_id and t.id=p.track_id
    where p.academy_id=p_academy_id and y.closed_at is null
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.get_question_bank_units(uuid) from public, anon, authenticated;
grant execute on function public.get_question_bank_units(uuid) to authenticated;

create function public.save_question_bank_questions(p_academy_id uuid, p_questions jsonb, p_program_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_id uuid;
  v_unit uuid;
  v_payload jsonb;
  v_count integer := 0;
begin
  if v_actor is null or not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or octet_length(p_questions::text) > 850000 then raise exception 'invalid_questions'; end if;
  if jsonb_array_length(p_questions) not between 1 and 30 then raise exception 'invalid_questions'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_questions)) <> jsonb_array_length(p_questions)
    then raise exception 'invalid_questions'; end if;
  if p_program_id is not null then
    perform 1 from public.content_programs p join public.academic_years y
      on y.academy_id=p.academy_id and y.id=p.academic_year_id
      where p.academy_id=p_academy_id and p.id=p_program_id and y.closed_at is null for share of p,y;
    if not found then raise exception 'invalid_program'; end if;
  end if;
  for v_item in select value from jsonb_array_elements(p_questions) order by value->>'id' loop
    v_id := (v_item->>'id')::uuid;
    v_unit := (v_item->>'unitId')::uuid;
    v_payload := v_item->'payload';
    if v_id is null or jsonb_typeof(v_payload) is distinct from 'object' then raise exception 'invalid_questions'; end if;
    if v_unit is not null then
      perform 1 from public.content_units u where u.academy_id=p_academy_id and u.id=v_unit and u.program_id=p_program_id
        and u.state<>'archived' for share;
      if not found then raise exception 'invalid_unit'; end if;
    end if;
    insert into public.question_bank_questions (academy_id,id,program_id,unit_id,created_by,payload)
    values(p_academy_id,v_id,p_program_id,v_unit,v_actor,v_payload)
    on conflict (academy_id,id) do nothing;
    -- Identical retries are safe, but never allow a reused ID to silently report a different save.
    if not found and not exists (
      select 1 from public.question_bank_questions q where q.academy_id=p_academy_id and q.id=v_id and q.created_by=v_actor
        and q.program_id is not distinct from p_program_id and q.unit_id is not distinct from v_unit and q.payload=v_payload
    ) then raise exception 'question_conflict'; end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.save_question_bank_questions(uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.save_question_bank_questions(uuid,jsonb,uuid) to authenticated;

commit;
