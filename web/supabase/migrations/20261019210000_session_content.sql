-- Taught content is a versioned historical association, not a learning grant.
begin;

create table public.session_content_sets (
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  revision integer not null check(revision>0),
  saved_by uuid not null references public.profiles(id),
  saved_by_name text,
  saved_at timestamptz not null default now(),
  primary key(session_id,revision),
  unique(academy_id,academic_year_id,session_id,revision),
  foreign key(academy_id,academic_year_id,session_id) references public.sessions(academy_id,academic_year_id,id)
);
create table public.session_content_items (
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  revision integer not null,
  unit_id uuid not null,
  content_revision integer not null,
  position integer not null check(position>0),
  title text not null,
  primary key(session_id,revision,unit_id),
  unique(session_id,revision,position),
  foreign key(academy_id,academic_year_id,session_id,revision) references public.session_content_sets(academy_id,academic_year_id,session_id,revision),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id),
  foreign key(unit_id,content_revision) references public.content_revisions(unit_id,revision)
);
create index session_content_items_unit on public.session_content_items(unit_id,content_revision);
create table public.session_content_requests (
  actor_id uuid not null references public.profiles(id),
  request_key uuid not null,
  academy_id uuid not null references public.academies(id),
  session_id uuid not null references public.sessions(id),
  fingerprint text not null,
  response jsonb not null,
  primary key(actor_id,request_key)
);

create function edra_private.protect_session_content_history() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'history_preserved'; end $$;
create trigger session_content_sets_history before update or delete on public.session_content_sets
for each row execute function edra_private.protect_session_content_history();
create trigger session_content_items_history before update or delete on public.session_content_items
for each row execute function edra_private.protect_session_content_history();
create trigger session_content_requests_history before update or delete on public.session_content_requests
for each row execute function edra_private.protect_session_content_history();
alter table public.session_content_sets enable row level security;
alter table public.session_content_items enable row level security;
alter table public.session_content_requests enable row level security;
revoke all on public.session_content_sets,public.session_content_items,public.session_content_requests from public,anon,authenticated;
grant select on public.session_content_sets,public.session_content_items to authenticated;
create policy session_content_sets_staff on public.session_content_sets for select to authenticated using(public.is_academy_member(academy_id));
create policy session_content_items_staff on public.session_content_items for select to authenticated using(public.is_academy_member(academy_id));

-- Downstream access consumers can resolve the frozen current set by session identity.
-- Staff-only RLS remains effective; this view is not a student learning API.
create view public.session_taught_content with(security_invoker=true) as
select i.* from public.session_content_items i
where i.revision=(select max(s.revision) from public.session_content_sets s where s.session_id=i.session_id);
revoke all on public.session_taught_content from public,anon;
grant select on public.session_taught_content to authenticated;

create function public.get_session_content(p_academy_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.sessions; version integer; reason text;
begin
  perform edra_private.content_actor(p_academy_id);
  select * into target from public.sessions where id=p_session_id and academy_id=p_academy_id;
  if not found then raise exception 'not_found'; end if;
  select coalesce(max(revision),0) into version from public.session_content_sets where session_id=target.id;
  reason:=case when target.archived_at is not null then 'archived'
    when exists(select 1 from public.academic_years y where y.id=target.academic_year_id and y.closed_at is not null) then 'year_closed'
    when exists(select 1 from public.attendance_sheets sh where sh.session_id=target.id and sh.publication_count>0) then 'finalized' end;
  return jsonb_build_object('revision',version,'lockReason',reason,
    'items',coalesce((select jsonb_agg(jsonb_build_object('unitId',i.unit_id,'revision',i.content_revision,'title',i.title) order by i.position)
      from public.session_content_items i where i.session_id=target.id and i.revision=version),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'savedAt',h.saved_at,'savedBy',h.saved_by_name,
      'titles',coalesce((select jsonb_agg(i.title order by i.position) from public.session_content_items i where i.session_id=h.session_id and i.revision=h.revision),'[]'::jsonb)) order by h.revision desc)
      from (select * from public.session_content_sets where session_id=target.id order by revision desc limit 20) h),'[]'::jsonb));
end $$;

create function public.session_content_options(p_academy_id uuid,p_session_id uuid,p_offset integer default 0,p_limit integer default 100)
returns table("unitId" uuid,revision integer,title text)
language plpgsql security definer set search_path='' as $$
declare target public.sessions;
begin
  perform edra_private.content_actor(p_academy_id);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then raise exception 'validation'; end if;
  select * into target from public.sessions where id=p_session_id and academy_id=p_academy_id;
  if not found then raise exception 'not_found'; end if;
  return query select u.id,u.published_revision,r.document->>'title'
    from public.content_units u join public.content_programs p on p.id=u.program_id
    join public.content_revisions r on r.unit_id=u.id and r.revision=u.published_revision
    where u.academy_id=p_academy_id and p.academic_year_id=target.academic_year_id and p.level_id=target.level_id
      and (p.track_id is null or p.track_id=target.track_id) and u.state='published'
    order by lower(r.document->>'title'),u.id offset p_offset limit p_limit;
end $$;

create function public.save_session_content(p_academy_id uuid,p_session_id uuid,p_expected_revision integer,p_items jsonb,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.sessions; version integer; prior public.session_content_requests; chosen record;
  unit public.content_units; program public.content_programs; fingerprint text; response jsonb; current_items jsonb;
begin
  perform edra_private.content_actor(p_academy_id);
  if p_key is null or p_expected_revision is null or p_expected_revision<0 or p_items is null or jsonb_typeof(p_items)<>'array'
    then raise exception 'validation'; end if;
  if jsonb_array_length(p_items)>200 then raise exception 'validation'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e)<>'object'
    or coalesce(e->>'unitId','')!~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(e->'revision')<>'number' or coalesce(e->>'revision','')!~ '^[1-9][0-9]{0,8}$' or e-'unitId'-'revision'<>'{}'::jsonb)
    then raise exception 'validation'; end if;
  if (select count(distinct (e->>'unitId')::uuid) from jsonb_array_elements(p_items) e)<>jsonb_array_length(p_items)
    then raise exception 'validation'; end if;
  fingerprint:=md5(jsonb_build_object('academy',p_academy_id,'session',p_session_id,'revision',p_expected_revision,'items',p_items)::text);
  perform edra_private.charge_mutation_quota('op:attendance_change');
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':session-content:'||p_key::text,0));
  target:=public.lock_attendance_session(p_academy_id,p_session_id);
  select * into prior from public.session_content_requests where actor_id=auth.uid() and request_key=p_key;
  if found then
    if prior.fingerprint<>fingerprint then raise exception 'idempotency_conflict'; end if;
    return prior.response||jsonb_build_object('replayed',true);
  end if;
  perform public.require_open_attendance_year(target);
  if exists(select 1 from public.attendance_sheets sh where sh.session_id=target.id and sh.publication_count>0)
    then raise exception 'content_finalized'; end if;
  select coalesce(max(revision),0) into version from public.session_content_sets where session_id=target.id;
  if version<>p_expected_revision then raise exception 'content_conflict'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('unitId',i.unit_id,'revision',i.content_revision) order by i.position),'[]'::jsonb)
    into current_items from public.session_content_items i where i.session_id=target.id and i.revision=version;
  if current_items<>p_items then
    -- Stable unit lock order also serializes publication/archival with selection.
    for chosen in select (e->>'unitId')::uuid id,(e->>'revision')::integer revision from jsonb_array_elements(p_items) e order by (e->>'unitId')::uuid loop
      -- Keeping an existing snapshot is valid even after its source is archived or republished.
      if exists(select 1 from public.session_content_items i where i.session_id=target.id and i.revision=version and i.unit_id=chosen.id and i.content_revision=chosen.revision) then continue; end if;
      select * into unit from public.content_units where id=chosen.id and academy_id=p_academy_id for share;
      if not found or unit.state<>'published' or unit.published_revision<>chosen.revision then raise exception 'content_unavailable'; end if;
      select * into strict program from public.content_programs where id=unit.program_id for share;
      if program.academic_year_id<>target.academic_year_id or program.level_id<>target.level_id
        or (program.track_id is not null and program.track_id is distinct from target.track_id) then raise exception 'incompatible_content'; end if;
    end loop;
    insert into public.session_content_sets(academy_id,academic_year_id,session_id,revision,saved_by,saved_by_name)
      select target.academy_id,target.academic_year_id,target.id,version+1,auth.uid(),nullif(btrim(p.full_name),'') from public.profiles p where p.id=auth.uid();
    insert into public.session_content_items(academy_id,academic_year_id,session_id,revision,unit_id,content_revision,position,title)
      select target.academy_id,target.academic_year_id,target.id,version+1,(e.value->>'unitId')::uuid,(e.value->>'revision')::integer,e.ordinality,
        coalesce(old.title,r.document->>'title')
      from jsonb_array_elements(p_items) with ordinality e(value,ordinality)
      join public.content_revisions r on r.unit_id=(e.value->>'unitId')::uuid and r.revision=(e.value->>'revision')::integer
      left join public.session_content_items old on old.session_id=target.id and old.revision=version and old.unit_id=r.unit_id and old.content_revision=r.revision;
    version:=version+1;
    -- Makes an attendance review opened before this change stale, using its existing contract.
    perform public.bump_attendance_revision(target);
    response:=jsonb_build_object('outcome','saved','revision',version);
  else response:=jsonb_build_object('outcome','unchanged','revision',version);
  end if;
  insert into public.session_content_requests(actor_id,request_key,academy_id,session_id,fingerprint,response)
    values(auth.uid(),p_key,p_academy_id,target.id,fingerprint,response);
  return response||jsonb_build_object('replayed',false);
end $$;

revoke all on function edra_private.protect_session_content_history() from public,anon,authenticated;
revoke all on function public.get_session_content(uuid,uuid) from public,anon;
revoke all on function public.session_content_options(uuid,uuid,integer,integer) from public,anon;
revoke all on function public.save_session_content(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.get_session_content(uuid,uuid), public.session_content_options(uuid,uuid,integer,integer), public.save_session_content(uuid,uuid,integer,jsonb,uuid) to authenticated;
commit;
