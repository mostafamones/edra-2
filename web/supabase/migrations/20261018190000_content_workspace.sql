-- Program-scoped staff content, immutable publication snapshots and private provider assets.
begin;

create table public.content_programs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id),
  academic_year_id uuid not null,
  level_id text not null,
  track_id uuid,
  foreign key (academy_id, academic_year_id) references public.academic_years(academy_id,id),
  foreign key (academy_id, level_id) references public.academy_levels(academy_id,level_id),
  foreign key (academy_id, level_id, track_id) references public.academy_tracks(academy_id,level_id,id) on delete set null (track_id),
  unique (academy_id,id)
);
-- Track removal may turn several historical program identities level-wide; keep those identities.
create index content_program_scope on public.content_programs(academy_id,academic_year_id,level_id,track_id);

create table public.content_units (
  id uuid primary key,
  academy_id uuid not null,
  program_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  state text not null default 'draft' check (state in ('draft','review','published','archived')),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  published_revision integer not null default 0,
  published_version integer not null default 0,
  source_unit_id uuid references public.content_units(id),
  foreign key (academy_id,program_id) references public.content_programs(academy_id,id),
  unique (academy_id,id)
);
create index content_units_program on public.content_units(program_id,updated_at desc,id);
create table public.content_revisions (
  unit_id uuid not null references public.content_units(id),
  academy_id uuid not null,
  revision integer not null,
  document jsonb not null,
  published_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  primary key(unit_id,revision),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id)
);
create table public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  unit_id uuid not null,
  author_id uuid not null references public.profiles(id),
  body text not null check(char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id)
);
create table public.content_assets (
  id uuid primary key,
  academy_id uuid not null,
  unit_id uuid not null,
  created_by uuid not null references public.profiles(id),
  kind text not null check(kind in ('video','document')),
  name text not null check(char_length(name) between 1 and 250),
  mime_type text not null,
  status text not null default 'uploading' check(status in ('uploading','processing','ready','failed')),
  provider_upload_id text unique,
  provider_asset_id text unique,
  playback_id text,
  storage_path text unique,
  created_at timestamptz not null default now(),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id),
  unique(academy_id,id)
);
create table public.content_assessments (
  academy_id uuid not null,
  unit_id uuid not null,
  kind text not null check(kind in ('assignment','quiz','exam')),
  assessment_id uuid not null,
  primary key(kind,assessment_id),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id)
);

alter table public.content_programs enable row level security;
alter table public.content_units enable row level security;
alter table public.content_revisions enable row level security;
alter table public.content_feedback enable row level security;
alter table public.content_assets enable row level security;
alter table public.content_assessments enable row level security;
create policy content_programs_staff on public.content_programs for select to authenticated using(public.is_academy_member(academy_id));
create policy content_units_staff on public.content_units for select to authenticated using(public.is_academy_member(academy_id));
create policy content_revisions_staff on public.content_revisions for select to authenticated using(public.is_academy_member(academy_id));
create policy content_feedback_staff on public.content_feedback for select to authenticated using(public.is_academy_member(academy_id));
create policy content_assets_staff on public.content_assets for select to authenticated using(public.is_academy_member(academy_id));
create policy content_assessments_staff on public.content_assessments for select to authenticated using(public.is_academy_member(academy_id));
revoke all on public.content_programs,public.content_units,public.content_revisions,public.content_feedback,public.content_assets,public.content_assessments from anon,authenticated;
grant select on public.content_programs,public.content_units,public.content_revisions,public.content_feedback,public.content_assets,public.content_assessments to authenticated;
grant all on public.content_assets to service_role;

create function edra_private.content_actor(p_academy uuid, p_manager boolean default false)
returns public.academy_role language plpgsql security definer set search_path='' as $$
declare r public.academy_role := public.academy_role_for(p_academy);
begin
  if auth.uid() is null or r is null or (p_manager and r not in ('owner','head_admin','admin')) then raise exception 'forbidden'; end if;
  return r;
end $$;

create function edra_private.content_edit(p_academy uuid,p_unit uuid,p_version integer default null)
returns public.content_units language plpgsql security definer set search_path='' as $$
declare u public.content_units; r public.academy_role; y uuid;
begin
  r := edra_private.content_actor(p_academy);
  select * into u from public.content_units where id=p_unit and academy_id=p_academy for update;
  if not found then raise exception 'not_found'; end if;
  if p_version is not null and u.version <> p_version then raise exception 'content_conflict'; end if;
  if u.state='archived' then raise exception 'archived'; end if;
  if r='instructor' and (u.created_by<>auth.uid() or u.published_revision>0) then raise exception 'forbidden'; end if;
  select p.academic_year_id into y from public.content_programs p where p.id=u.program_id;
  perform 1 from public.academic_years where id=y and academy_id=p_academy and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  return u;
end $$;

-- Checks attachment coverage against the complete configured audience, not a client preview.
create function edra_private.content_assessment(p_program uuid,p_kind text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.content_programs; a jsonb; t text; g text; active boolean;
begin
  select * into strict p from public.content_programs where id=p_program;
  if p_kind not in ('assignment','quiz','exam') then raise exception 'invalid_assessment'; end if;
  t := case p_kind when 'assignment' then 'assignments' when 'quiz' then 'quizzes' else 'exams' end;
  g := case p_kind when 'assignment' then 'assignment_audience_groups' when 'quiz' then 'quiz_audience_groups' else 'exam_audience_groups' end;
  execute format('select to_jsonb(a) from public.%I a where id=$1 for share',t) into a using p_id;
  if a is null or (a->>'academy_id')::uuid<>p.academy_id or (a->>'academic_year_id')::uuid<>p.academic_year_id
    or a->>'archived_at' is not null or a->>'state'='archived' then raise exception 'incompatible_assessment'; end if;
  if a->>'audience' in ('level','program') then
    if a->>'level_id'<>p.level_id or (p.track_id is not null and (a->>'track_id')::uuid is distinct from p.track_id) then raise exception 'incompatible_assessment'; end if;
  elsif a->>'audience'='groups' then
    execute format('select exists(select 1 from public.%I a join public.groups g on g.id=a.group_id where a.%I=$1 and (g.level_id<>$2 or ($3 is not null and g.track_id is distinct from $3)))',g,p_kind||'_id') into active using p_id,p.level_id,p.track_id;
    if active then raise exception 'incompatible_assessment'; end if;
  else raise exception 'incompatible_assessment'; end if;
  if p_kind='assignment' then return edra_private.assignment_has_activity(p_id);
  else return a->>'work_started_at' is not null or a->>'structure_locked_at' is not null; end if;
end $$;

create function edra_private.content_document(p_unit uuid,p_document jsonb,p_publish boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare u public.content_units; item jsonb; asset public.content_assets; old_link record; ids uuid[]:='{}'; explanation boolean:=false; count_items integer;
begin
  select * into strict u from public.content_units where id=p_unit;
  if jsonb_typeof(p_document) is distinct from 'object' or jsonb_typeof(p_document->'items') is distinct from 'array'
    or char_length(btrim(coalesce(p_document->>'title',''))) not between 1 and 200
    or char_length(coalesce(p_document->>'description',''))>10000 then raise exception 'validation'; end if;
  count_items := jsonb_array_length(p_document->'items');
  if count_items>200 then raise exception 'validation'; end if;
  for item in select value from jsonb_array_elements(p_document->'items') loop
    if item->>'id' is null or (item->>'id')::uuid=any(ids) then raise exception 'validation'; end if;
    ids:=array_append(ids,(item->>'id')::uuid);
    if item->>'kind' is null or item->>'kind' not in ('explanation','answer','document','assessment') or char_length(btrim(coalesce(item->>'title',''))) not between 1 and 250 then raise exception 'validation'; end if;
    if item->>'kind' in ('explanation','answer','document') then
      select * into asset from public.content_assets where id=(item->>'assetId')::uuid and academy_id=u.academy_id;
      if not found or (item->>'kind'='document')<>(asset.kind='document') then raise exception 'invalid_asset'; end if;
      if p_publish and asset.status<>'ready' then raise exception 'assets_not_ready'; end if;
      if item->>'kind'='explanation' and asset.status='ready' then explanation:=true; end if;
    end if;
    if item->>'kind' in ('answer','assessment') then
      perform edra_private.content_assessment(u.program_id,item->>'assessmentKind',(item->>'assessmentId')::uuid);
      if item->>'kind'='answer' and not exists(select 1 from jsonb_array_elements(p_document->'items') i where i->>'kind'='assessment' and i->>'assessmentKind'=item->>'assessmentKind' and i->>'assessmentId'=item->>'assessmentId') then raise exception 'answer_requires_assessment'; end if;
    end if;
  end loop;
  if p_publish and not explanation then raise exception 'explanation_required'; end if;
  -- Work locks an existing attachment, but not the first attachment of a standalone assignment.
  for old_link in select * from public.content_assessments where unit_id=p_unit order by kind,assessment_id loop
    if not exists(select 1 from jsonb_array_elements(p_document->'items') i where i->>'kind'='assessment' and i->>'assessmentKind'=old_link.kind and (i->>'assessmentId')::uuid=old_link.assessment_id)
      and edra_private.content_assessment(u.program_id,old_link.kind,old_link.assessment_id) then raise exception 'attachment_locked'; end if;
  end loop;
  delete from public.content_assessments l where l.unit_id=p_unit and not exists(select 1 from jsonb_array_elements(p_document->'items') i where i->>'kind'='assessment' and i->>'assessmentKind'=l.kind and (i->>'assessmentId')::uuid=l.assessment_id);
  insert into public.content_assessments(academy_id,unit_id,kind,assessment_id)
    select distinct u.academy_id,u.id,i->>'assessmentKind',(i->>'assessmentId')::uuid from jsonb_array_elements(p_document->'items') i where i->>'kind'='assessment'
    on conflict(kind,assessment_id) do nothing;
  if exists(select 1 from jsonb_array_elements(p_document->'items') i join public.content_assessments l on l.kind=i->>'assessmentKind' and l.assessment_id=(i->>'assessmentId')::uuid where i->>'kind'='assessment' and l.unit_id<>p_unit) then raise exception 'assessment_already_attached'; end if;
end $$;

create function public.create_content_unit(p_academy_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_unit_id uuid,p_title text)
returns uuid language plpgsql security definer set search_path='' as $$
declare program uuid;
begin
  perform edra_private.content_actor(p_academy_id);
  perform 1 from public.academic_years where id=p_year_id and academy_id=p_academy_id and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  if char_length(btrim(p_title)) not between 1 and 200 or p_unit_id is null then raise exception 'validation'; end if;
  if exists(select 1 from public.content_units where id=p_unit_id and academy_id=p_academy_id and created_by=auth.uid()) then return p_unit_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id||':'||p_year_id||':'||p_level_id||':'||coalesce(p_track_id::text,''),0));
  select id into program from public.content_programs where academy_id=p_academy_id and academic_year_id=p_year_id and level_id=p_level_id and track_id is not distinct from p_track_id order by id limit 1;
  if program is null then
    insert into public.content_programs(academy_id,academic_year_id,level_id,track_id) values(p_academy_id,p_year_id,p_level_id,p_track_id) returning id into program;
  end if;
  insert into public.content_units(id,academy_id,program_id,created_by,draft) values(p_unit_id,p_academy_id,program,auth.uid(),jsonb_build_object('title',btrim(p_title),'description','','items','[]'::jsonb));
  return p_unit_id;
end $$;

create function public.save_content_unit(p_academy_id uuid,p_unit_id uuid,p_version integer,p_document jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare u public.content_units;
begin
  u:=edra_private.content_edit(p_academy_id,p_unit_id,p_version);
  perform edra_private.content_document(p_unit_id,p_document);
  update public.content_units set draft=p_document,version=version+1,updated_at=now() where id=p_unit_id;
  return u.version+1;
end $$;

create function public.change_content_unit(p_academy_id uuid,p_unit_id uuid,p_version integer,p_action text,p_feedback text default '')
returns integer language plpgsql security definer set search_path='' as $$
declare u public.content_units; r public.academy_role; y uuid;
begin
  r:=edra_private.content_actor(p_academy_id,p_action not in ('submit'));
  select * into u from public.content_units where id=p_unit_id and academy_id=p_academy_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_version is null or u.version<>p_version then raise exception 'content_conflict'; end if;
  select academic_year_id into y from public.content_programs where id=u.program_id;
  perform 1 from public.academic_years where id=y and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  if p_action='restore' then
    if u.state<>'archived' then raise exception 'invalid_state'; end if;
    update public.content_units set state='draft',version=version+1,updated_at=now() where id=u.id;
  elsif p_action='archive' then
    update public.content_units set state='archived',version=version+1,updated_at=now() where id=u.id;
  elsif p_action='publish' then
    if u.state='archived' then raise exception 'archived'; end if;
    if u.state='published' and u.version=u.published_version then return u.version; end if;
    perform edra_private.content_document(u.id,u.draft,true);
    insert into public.content_revisions(unit_id,academy_id,revision,document,published_by) values(u.id,u.academy_id,u.published_revision+1,u.draft,auth.uid());
    update public.content_units set state='published',published_revision=published_revision+1,published_version=version+1,version=version+1,updated_at=now() where id=u.id;
  elsif p_action='submit' then
    perform edra_private.content_edit(p_academy_id,p_unit_id,p_version);
    if u.published_revision>0 then raise exception 'forbidden'; end if;
    update public.content_units set state='review',version=version+1,updated_at=now() where id=u.id;
  elsif p_action in ('feedback','request_changes') then
    if u.state='archived' or char_length(btrim(coalesce(p_feedback,''))) not between 1 and 5000 then raise exception 'validation'; end if;
    insert into public.content_feedback(academy_id,unit_id,author_id,body) values(u.academy_id,u.id,auth.uid(),p_feedback);
    update public.content_units set state=case when p_action='request_changes' and state='review' then 'draft' else state end,version=version+1,updated_at=now() where id=u.id;
  else raise exception 'validation'; end if;
  return u.version+1;
end $$;

create function public.register_content_asset(p_academy_id uuid,p_unit_id uuid,p_id uuid,p_kind text,p_name text,p_mime text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform edra_private.content_edit(p_academy_id,p_unit_id);
  if p_id is null or p_kind not in ('video','document') then raise exception 'validation'; end if;
  insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,storage_path)
    values(p_id,p_academy_id,p_unit_id,auth.uid(),p_kind,p_name,p_mime,case when p_kind='document' then p_academy_id||'/'||p_unit_id||'/'||p_id else null end)
    on conflict(id) do nothing;
  if not exists(select 1 from public.content_assets where id=p_id and academy_id=p_academy_id and unit_id=p_unit_id and created_by=auth.uid() and kind=p_kind) then raise exception 'forbidden'; end if;
  return p_id;
end $$;

-- Uploaded documents are private. Signing/reading uses active staff authority; never a public URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('content-documents','content-documents',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']) on conflict(id) do nothing;
create function edra_private.content_storage_write(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.content_assets a join public.content_units u on u.id=a.unit_id join public.content_programs p on p.id=u.program_id join public.academic_years y on y.id=p.academic_year_id
    where a.storage_path=p_name and a.kind='document' and a.created_by=auth.uid() and a.status='uploading' and y.closed_at is null and u.state<>'archived'
    and public.academy_role_for(a.academy_id) is not null and (public.academy_role_for(a.academy_id)<>'instructor' or (u.created_by=auth.uid() and u.published_revision=0)));
$$;
create policy content_document_insert on storage.objects for insert to authenticated with check(bucket_id='content-documents' and edra_private.content_storage_write(name));
create policy content_document_read on storage.objects for select to authenticated using(bucket_id='content-documents' and exists(select 1 from public.content_assets a where a.storage_path=name and public.is_academy_member(a.academy_id)));
grant usage on schema edra_private to authenticated;
grant execute on function edra_private.content_storage_write(text) to authenticated;

-- Public RPCs are the only authenticated mutation path.
revoke all on function edra_private.content_actor(uuid,boolean),edra_private.content_edit(uuid,uuid,integer),edra_private.content_assessment(uuid,text,uuid),edra_private.content_document(uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function edra_private.content_storage_write(text) from public,anon;
revoke all on function public.create_content_unit(uuid,uuid,text,uuid,uuid,text),public.save_content_unit(uuid,uuid,integer,jsonb),public.change_content_unit(uuid,uuid,integer,text,text),public.register_content_asset(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.create_content_unit(uuid,uuid,text,uuid,uuid,text),public.save_content_unit(uuid,uuid,integer,jsonb),public.change_content_unit(uuid,uuid,integer,text,text),public.register_content_asset(uuid,uuid,uuid,text,text,text) to authenticated;
commit;
