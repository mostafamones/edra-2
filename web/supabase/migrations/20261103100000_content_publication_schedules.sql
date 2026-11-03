-- Manager-confirmed versions and one current publication schedule per unit.
--
-- Every command here takes the offering gate and then the content_units row lock, the same order saves
-- and immediate publication use, so confirmation, scheduling, cancellation, Publish now and the worker are
-- linearized per unit. Confirming and scheduling do not bump content_units.version: staff keep editing
-- the working draft without conflicts, and a published candidate never touches that draft.
begin;

-- A candidate is approved content, not a draft save. kind='version' in content_drafts is not approval.
create table public.content_publication_candidates (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  unit_id uuid not null,
  sequence bigint generated always as identity,
  -- The working-draft version that was reviewed, and the publication it would replace.
  unit_version integer not null,
  base_revision integer not null,
  document jsonb not null,
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default clock_timestamp(),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id),
  unique(unit_id,id),
  unique(unit_id,unit_version,base_revision)
);
create index content_publication_candidates_latest on public.content_publication_candidates(unit_id,base_revision,sequence desc);
create index content_publication_candidates_academy on public.content_publication_candidates(academy_id);

-- Links an actual publication to the approved version it came from. Null for immediate publication.
alter table public.content_revisions add column candidate_id uuid;
alter table public.content_revisions add constraint content_revisions_candidate_fkey
  foreign key(unit_id,candidate_id) references public.content_publication_candidates(unit_id,id);

create table public.content_publication_schedules (
  unit_id uuid primary key,
  academy_id uuid not null,
  -- Grows on every schedule change and terminal outcome; a stale command or worker claim cannot act on it.
  generation integer not null default 1 check(generation>0),
  state text not null check(state in ('pending','published','cancelled','stopped')),
  scheduled_for timestamptz not null,
  -- Live authority at execution is checked for this manager; rescheduling transfers it.
  scheduled_by uuid not null references public.profiles(id),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  reason text,
  candidate_id uuid,
  published_revision integer,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id),
  foreign key(unit_id,candidate_id) references public.content_publication_candidates(unit_id,id),
  foreign key(unit_id,published_revision) references public.content_revisions(unit_id,revision),
  check((state='pending')=(next_attempt_at is not null))
);
create index content_publication_schedules_due on public.content_publication_schedules(next_attempt_at,unit_id) where state='pending';
create index content_publication_schedules_academy on public.content_publication_schedules(academy_id,state);

create table public.content_publication_events (
  id bigint generated always as identity primary key,
  academy_id uuid not null,
  unit_id uuid not null,
  generation integer,
  kind text not null check(kind in ('confirmed','scheduled','rescheduled','cancelled','retrying','stopped','published')),
  actor_id uuid references public.profiles(id),
  candidate_id uuid,
  revision integer,
  scheduled_for timestamptz,
  reason text,
  at timestamptz not null default clock_timestamp(),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id),
  foreign key(unit_id,candidate_id) references public.content_publication_candidates(unit_id,id),
  foreign key(unit_id,revision) references public.content_revisions(unit_id,revision)
);
create index content_publication_events_unit on public.content_publication_events(unit_id,id desc);
-- The execution receipt: one schedule generation can publish once.
create unique index content_publication_receipt on public.content_publication_events(unit_id,generation) where kind='published';

create function edra_private.content_publication_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'content_publication_immutable'; end $$;
create trigger content_publication_candidates_immutable before update or delete on public.content_publication_candidates
  for each row execute function edra_private.content_publication_immutable();
create trigger content_publication_events_immutable before update or delete on public.content_publication_events
  for each row execute function edra_private.content_publication_immutable();
-- A candidate cannot gain an asset that is being deleted.
create trigger content_candidate_asset_deletion_guard before insert on public.content_publication_candidates
  for each row execute function edra_private.content_asset_deletion_guard();

alter table public.content_publication_candidates enable row level security;
alter table public.content_publication_schedules enable row level security;
alter table public.content_publication_events enable row level security;
-- Confirmed versions appear in staff history; scheduling itself is a manager concern.
create policy content_publication_candidates_staff on public.content_publication_candidates for select to authenticated using(public.is_academy_member(academy_id));
create policy content_publication_schedules_manager on public.content_publication_schedules for select to authenticated using(public.is_academy_manager(academy_id));
create policy content_publication_events_manager on public.content_publication_events for select to authenticated using(public.is_academy_manager(academy_id));
revoke all on public.content_publication_candidates,public.content_publication_schedules,public.content_publication_events from public,anon,authenticated;
grant select on public.content_publication_candidates,public.content_publication_schedules,public.content_publication_events to authenticated;

-- Approved versions keep their assets: an unused-video deletion must not break one.
create or replace function edra_private.content_asset_unused(p_academy uuid,p_asset uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.content_units u where u.academy_id=p_academy
      and u.draft->'items' @> jsonb_build_array(jsonb_build_object('assetId',p_asset)))
    or exists(select 1 from public.content_revisions r where r.academy_id=p_academy
      and r.document->'items' @> jsonb_build_array(jsonb_build_object('assetId',p_asset)))
    or exists(select 1 from public.content_publication_candidates c where c.academy_id=p_academy
      and c.document->'items' @> jsonb_build_array(jsonb_build_object('assetId',p_asset))) then
    raise exception 'asset_in_use';
  end if;
end $$;

-- Approved versions keep their coupon type too.
do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.delete_content_coupon_type(uuid,uuid,uuid)'::regprocedure);
  updated:=replace(definition, $r$or exists(select 1 from public.content_revisions v where v.document->>'couponTypeId'=t.id::text)$r$,
    $r$or exists(select 1 from public.content_revisions v where v.document->>'couponTypeId'=t.id::text)
  or exists(select 1 from public.content_publication_candidates c where c.academy_id=p_academy_id and c.document->>'couponTypeId'=t.id::text)$r$);
  if updated=definition then raise exception 'Coupon type guard changed'; end if;
  execute updated;
end $$;

-- The same validator, except which attachments survive it: a save keeps those of the version awaiting
-- publication, so that assessment can't move to another unit; publishing keeps those of the working
-- draft, which may be newer than a confirmed version.
create or replace function edra_private.content_document_before_requirements(p_unit uuid,p_document jsonb,p_publish boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare u public.content_units; item jsonb; asset public.content_assets; old_link record; ids uuid[]:='{}'; explanation boolean:=false; count_items integer; kept jsonb;
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
      if not found or (item->>'kind'<>'answer' and (item->>'kind'='document')<>(asset.kind='document')) then raise exception 'invalid_asset'; end if;
      if p_publish and asset.status<>'ready' then raise exception 'assets_not_ready'; end if;
      if item->>'kind'='explanation' and asset.status='ready' then explanation:=true; end if;
    end if;
    if item->>'kind' in ('answer','assessment') then
      perform edra_private.content_assessment(u.program_id,item->>'assessmentKind',(item->>'assessmentId')::uuid);
      if item->>'kind'='answer' and not exists(select 1 from jsonb_array_elements(p_document->'items') i where i->>'kind'='assessment' and i->>'assessmentKind'=item->>'assessmentKind' and i->>'assessmentId'=item->>'assessmentId') then raise exception 'answer_requires_assessment'; end if;
    end if;
  end loop;
  if p_publish and not explanation then raise exception 'explanation_required'; end if;
  kept:=p_document->'items'||case when p_publish then coalesce(u.draft->'items','[]'::jsonb)
    else coalesce((select c.document->'items' from public.content_publication_candidates c where c.unit_id=p_unit and c.base_revision=u.published_revision order by c.sequence desc limit 1),'[]'::jsonb) end;
  -- Work locks an existing attachment, but not the first attachment of a standalone assignment.
  for old_link in select * from public.content_assessments where unit_id=p_unit order by kind,assessment_id loop
    if not exists(select 1 from jsonb_array_elements(kept) i where i->>'kind'='assessment' and i->>'assessmentKind'=old_link.kind and (i->>'assessmentId')::uuid=old_link.assessment_id)
      and edra_private.content_assessment(u.program_id,old_link.kind,old_link.assessment_id) then raise exception 'attachment_locked'; end if;
  end loop;
  delete from public.content_assessments l where l.unit_id=p_unit and not exists(select 1 from jsonb_array_elements(kept) i where i->>'kind'='assessment' and i->>'assessmentKind'=l.kind and (i->>'assessmentId')::uuid=l.assessment_id);
  insert into public.content_assessments(academy_id,unit_id,kind,assessment_id)
    select distinct u.academy_id,u.id,i->>'assessmentKind',(i->>'assessmentId')::uuid from jsonb_array_elements(p_document->'items') i where i->>'kind'='assessment'
    on conflict(kind,assessment_id) do nothing;
  if exists(select 1 from jsonb_array_elements(p_document->'items') i join public.content_assessments l on l.kind=i->>'assessmentKind' and l.assessment_id=(i->>'assessmentId')::uuid where i->>'kind'='assessment' and l.unit_id<>p_unit) then raise exception 'assessment_already_attached'; end if;
end $$;

-- The newest approved version still ahead of the live publication. Any publication retires older ones,
-- because they would otherwise roll the live content back.
create function edra_private.content_latest_candidate(p_unit uuid,p_revision integer)
returns public.content_publication_candidates language sql stable security definer set search_path='' as $$
  select c.* from public.content_publication_candidates c
  where c.unit_id=p_unit and c.base_revision=p_revision order by c.sequence desc limit 1;
$$;

-- The publication both immediate and scheduled paths share. The caller holds the unit lock and decides
-- what happens to the working draft's version.
create function edra_private.content_publish(u public.content_units,p_document jsonb,p_publisher uuid,p_candidate uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform edra_private.content_document(u.id,p_document,true);
  insert into public.content_revisions(unit_id,academy_id,revision,document,published_by,candidate_id)
    values(u.id,u.academy_id,u.published_revision+1,p_document,p_publisher,p_candidate);
  update public.content_units set published_revision=published_revision+1 where id=u.id;
  return u.published_revision+1;
end $$;

-- Ends a schedule that is still open (pending, or stopped and awaiting recovery).
create function edra_private.content_schedule_end(p_unit uuid,p_state text,p_reason text,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.content_publication_schedules;
begin
  update public.content_publication_schedules set state=p_state,reason=p_reason,next_attempt_at=null,generation=generation+1,updated_at=clock_timestamp()
    where unit_id=p_unit and state in ('pending','stopped') returning * into s;
  if found then
    insert into public.content_publication_events(academy_id,unit_id,generation,kind,actor_id,scheduled_for,reason)
      values(s.academy_id,s.unit_id,s.generation,p_state,p_actor,s.scheduled_for,p_reason);
  end if;
end $$;

create function edra_private.content_schedule_view(s public.content_publication_schedules)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('state',s.state,'generation',s.generation,'scheduledFor',s.scheduled_for);
$$;

-- Unchanged apart from the shared publication, its atomic schedule cancellation, and archive stopping a
-- schedule so a later restore can't republish without a manager acting again.
create or replace function public.change_content_unit(p_academy_id uuid,p_unit_id uuid,p_version integer,p_action text,p_feedback text default '')
returns integer language plpgsql security definer set search_path='' as $$
declare u public.content_units; r public.academy_role; y uuid;
begin
  perform edra_private.offering_gate();
  r:=edra_private.content_actor(p_academy_id,p_action not in ('submit'));
  select * into u from public.content_units where id=p_unit_id and academy_id=p_academy_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_version is null or u.version<>p_version then raise exception 'content_conflict'; end if;
  select academic_year_id into y from public.content_programs where id=u.program_id;
  perform 1 from public.academic_years where id=y and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  if p_action='restore' then
    if u.state<>'archived' then raise exception 'invalid_state'; end if;
    update public.content_units set state='draft',review_requested_at=null,version=version+1,updated_at=now() where id=u.id;
  elsif p_action='archive' then
    update public.content_units set state='archived',review_requested_at=null,version=version+1,updated_at=now() where id=u.id;
    perform edra_private.content_schedule_end(u.id,'stopped','archived',auth.uid());
  elsif p_action='publish' then
    if u.state='archived' then raise exception 'archived'; end if;
    if u.state='published' and u.version=u.published_version then return u.version; end if;
    perform edra_private.content_publish(u,u.draft,auth.uid());
    update public.content_units set state='published',review_requested_at=null,published_version=version+1,version=version+1,updated_at=now() where id=u.id;
    perform edra_private.content_schedule_end(u.id,'cancelled','published_now',auth.uid());
  elsif p_action='submit' then
    perform edra_private.content_edit(p_academy_id,p_unit_id,p_version);
    update public.content_units set state=case when state='published' then 'published' else 'review' end,review_requested_at=now(),version=version+1,updated_at=now() where id=u.id;
  elsif p_action in ('feedback','request_changes') then
    if u.state='archived' or char_length(btrim(coalesce(p_feedback,''))) not between 1 and 5000 then raise exception 'validation'; end if;
    insert into public.content_feedback(academy_id,unit_id,author_id,body) values(u.academy_id,u.id,auth.uid(),p_feedback);
    update public.content_units set state=case when p_action='request_changes' and state='review' then 'draft' else state end,
      review_requested_at=case when p_action='request_changes' then null else review_requested_at end,
      version=version+1,updated_at=now() where id=u.id;
  else raise exception 'validation'; end if;
  return u.version+1;
end $$;

-- Approves the exact working draft at p_version without making it live.
create function public.confirm_content_version(p_academy_id uuid,p_unit_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare u public.content_units; c uuid;
begin
  perform edra_private.offering_gate();
  perform edra_private.content_actor(p_academy_id,true);
  if p_version is null or p_version<1 then raise exception 'validation'; end if;
  u:=edra_private.content_edit(p_academy_id,p_unit_id,p_version);
  select id into c from public.content_publication_candidates where unit_id=u.id and unit_version=u.version and base_revision=u.published_revision;
  if found then return c; end if;
  if exists(select 1 from public.content_revisions v where v.unit_id=u.id and v.revision=u.published_revision and v.document=u.draft) then raise exception 'nothing_to_publish'; end if;
  perform edra_private.content_document(u.id,u.draft,true);
  insert into public.content_publication_candidates(academy_id,unit_id,unit_version,base_revision,document,confirmed_by)
    values(u.academy_id,u.id,u.version,u.published_revision,u.draft,auth.uid()) returning id into c;
  if not exists(select 1 from public.content_drafts where unit_id=u.id and version=u.version and kind='version') then
    insert into public.content_drafts(unit_id,academy_id,version,kind,document,saved_by) values(u.id,u.academy_id,u.version,'version',u.draft,auth.uid());
  end if;
  update public.content_units set state=case when state='published' then 'published' else 'review' end,review_requested_at=coalesce(review_requested_at,now()),updated_at=now() where id=u.id;
  insert into public.content_publication_events(academy_id,unit_id,kind,actor_id,candidate_id) values(u.academy_id,u.id,'confirmed',auth.uid(),c);
  return c;
end $$;

-- Creates or moves the unit's schedule; p_generation is what the caller last saw, 0 for none.
create function public.schedule_content_publication(p_academy_id uuid,p_unit_id uuid,p_at timestamptz,p_generation integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.content_units; s public.content_publication_schedules; had_pending boolean;
begin
  perform edra_private.offering_gate();
  perform edra_private.content_actor(p_academy_id,true);
  u:=edra_private.content_edit(p_academy_id,p_unit_id);
  select * into s from public.content_publication_schedules where unit_id=u.id for update;
  -- A retried command whose outcome already stands.
  if found and s.state='pending' and s.scheduled_for=p_at and s.scheduled_by=auth.uid() then return edra_private.content_schedule_view(s); end if;
  if coalesce(s.generation,0) is distinct from p_generation then raise exception 'schedule_conflict'; end if;
  if p_at is null or p_at<=clock_timestamp() then raise exception 'schedule_in_past'; end if;
  if (edra_private.content_latest_candidate(u.id,u.published_revision)).id is null then raise exception 'confirmation_required'; end if;
  had_pending:=coalesce(s.state='pending',false);
  insert into public.content_publication_schedules(unit_id,academy_id,state,scheduled_for,scheduled_by,next_attempt_at)
    values(u.id,u.academy_id,'pending',p_at,auth.uid(),p_at)
    on conflict(unit_id) do update set generation=content_publication_schedules.generation+1,state='pending',scheduled_for=p_at,scheduled_by=auth.uid(),
      attempts=0,next_attempt_at=p_at,last_attempt_at=null,reason=null,candidate_id=null,published_revision=null,updated_at=clock_timestamp()
    returning * into s;
  insert into public.content_publication_events(academy_id,unit_id,generation,kind,actor_id,scheduled_for)
    values(u.academy_id,u.id,s.generation,case when had_pending then 'rescheduled' else 'scheduled' end,auth.uid(),p_at);
  return edra_private.content_schedule_view(s);
end $$;

-- Reports the actual outcome: a schedule the worker already published stays published, not "cancelled".
create function public.cancel_content_publication(p_academy_id uuid,p_unit_id uuid,p_generation integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.content_publication_schedules;
begin
  perform edra_private.offering_gate();
  perform edra_private.content_actor(p_academy_id,true);
  perform 1 from public.content_units where id=p_unit_id and academy_id=p_academy_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into s from public.content_publication_schedules where unit_id=p_unit_id for update;
  if not found then raise exception 'not_found'; end if;
  if s.state in ('pending','stopped') then
    if s.generation is distinct from p_generation then raise exception 'schedule_conflict'; end if;
    perform edra_private.content_schedule_end(p_unit_id,'cancelled',null,auth.uid());
    select * into strict s from public.content_publication_schedules where unit_id=p_unit_id;
  end if;
  return edra_private.content_schedule_view(s);
end $$;

revoke all on function edra_private.content_publication_immutable(),edra_private.content_latest_candidate(uuid,integer),
  edra_private.content_publish(public.content_units,jsonb,uuid,uuid),edra_private.content_schedule_end(uuid,text,text,uuid),
  edra_private.content_schedule_view(public.content_publication_schedules) from public,anon,authenticated;
revoke all on function public.confirm_content_version(uuid,uuid,integer),public.schedule_content_publication(uuid,uuid,timestamptz,integer),public.cancel_content_publication(uuid,uuid,integer) from public,anon;
grant execute on function public.confirm_content_version(uuid,uuid,integer),public.schedule_content_publication(uuid,uuid,timestamptz,integer),public.cancel_content_publication(uuid,uuid,integer) to authenticated;
commit;
