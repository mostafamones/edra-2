begin;
-- EDRA-237: preserve publication authority while allowing instructors to maintain
-- their own working material after its first publication. Existing function
-- signatures/grants and immutable publication records are retained.

-- Publication visibility and a request to review its next revision are separate.
alter table public.content_units add column review_requested_at timestamptz;

create or replace function edra_private.content_edit(p_academy uuid,p_unit uuid,p_version integer default null)
returns public.content_units language plpgsql security definer set search_path='' as $$
declare u public.content_units; r public.academy_role; y uuid;
begin
  r := edra_private.content_actor(p_academy);
  select * into u from public.content_units where id=p_unit and academy_id=p_academy for update;
  if not found then raise exception 'not_found'; end if;
  if p_version is not null and u.version <> p_version then raise exception 'content_conflict'; end if;
  if u.state='archived' then raise exception 'archived'; end if;
  if r='instructor' and u.created_by<>auth.uid() then raise exception 'forbidden'; end if;
  select p.academic_year_id into y from public.content_programs p where p.id=u.program_id;
  perform 1 from public.academic_years where id=y and academy_id=p_academy and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  return u;
end $$;

-- Submitting published changes must keep the currently published release visible.
-- Keep the request visible to managers without unpublishing the unit.
create or replace function public.change_content_unit(p_academy_id uuid,p_unit_id uuid,p_version integer,p_action text,p_feedback text default '')
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
    update public.content_units set state='draft',review_requested_at=null,version=version+1,updated_at=now() where id=u.id;
  elsif p_action='archive' then
    update public.content_units set state='archived',review_requested_at=null,version=version+1,updated_at=now() where id=u.id;
  elsif p_action='publish' then
    if u.state='archived' then raise exception 'archived'; end if;
    if u.state='published' and u.version=u.published_version then return u.version; end if;
    perform edra_private.content_document(u.id,u.draft,true);
    insert into public.content_revisions(unit_id,academy_id,revision,document,published_by) values(u.id,u.academy_id,u.published_revision+1,u.draft,auth.uid());
    update public.content_units set state='published',review_requested_at=null,published_revision=published_revision+1,published_version=version+1,version=version+1,updated_at=now() where id=u.id;
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

create or replace function edra_private.content_storage_write(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.content_assets a
    join public.content_units u on u.id=a.unit_id
    join public.content_programs p on p.id=u.program_id
    join public.academic_years y on y.id=p.academic_year_id
    where a.storage_path=p_name and a.kind='document' and a.created_by=auth.uid()
      and a.status='uploading' and a.deletion_token is null
      and y.closed_at is null and u.state<>'archived'
      and public.academy_role_for(a.academy_id) is not null
      and (public.academy_role_for(a.academy_id)<>'instructor' or u.created_by=auth.uid())
  );
$$;

create or replace function edra_private.content_shape()
returns trigger language plpgsql set search_path='' as $$
declare item jsonb; doc jsonb:=new.draft; days numeric;
begin
  if jsonb_typeof(doc) is distinct from 'object'
    or jsonb_typeof(doc->'title') is distinct from 'string'
    or char_length(btrim(doc->>'title')) not between 1 and 200
    or jsonb_typeof(doc->'description') is distinct from 'string'
    or char_length(doc->>'description')>10000
    or jsonb_typeof(doc->'items') is distinct from 'array'
    or doc-array['title','description','items','accessDays']<>'{}'::jsonb then raise exception 'validation'; end if;
  -- The duration is publication data; existing revision snapshots are immutable.
  if doc ? 'accessDays' then
    if jsonb_typeof(doc->'accessDays') is distinct from 'number' then raise exception 'validation'; end if;
    days := (doc->>'accessDays')::numeric;
    if days<>trunc(days) or days not between 1 and 2147483647 then raise exception 'validation'; end if;
    new.draft := doc || jsonb_build_object('accessDays',days::integer);
  else
    -- Old clients may omit the new field; preserve an already configured value.
    new.draft := doc || jsonb_build_object('accessDays',
      case when TG_OP='UPDATE' then coalesce(old.draft->'accessDays','7'::jsonb) else '7'::jsonb end);
  end if;
  if jsonb_array_length(doc->'items')>200 then raise exception 'validation'; end if;
  for item in select value from jsonb_array_elements(doc->'items') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'kind') is distinct from 'string'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or char_length(btrim(item->>'title')) not between 1 and 250
      or item-array['id','kind','title','assetId','assessmentKind','assessmentId']<>'{}'::jsonb
      or (item ? 'assetId' and jsonb_typeof(item->'assetId') is distinct from 'string')
      or (item ? 'assessmentId' and jsonb_typeof(item->'assessmentId') is distinct from 'string')
      or (item ? 'assessmentKind' and (jsonb_typeof(item->'assessmentKind') is distinct from 'string' or item->>'assessmentKind' not in ('assignment','quiz','exam')))
      then raise exception 'validation'; end if;
  end loop;
  return new;
end $$;

commit;

