begin;

create function public.list_my_content_units(p_academy_id uuid,p_offset integer default 0,p_limit integer default 24,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare record_id uuid; year_id uuid; r public.annual_student_records; result jsonb;
begin
  if edra_auth.session_allowed() is not true or auth.uid() is null then raise exception 'student_unavailable'; end if;
  if p_offset is null or p_offset not between 0 and 100000 or p_limit is null or p_limit not between 1 and 100 or char_length(coalesce(p_search,''))>100 then raise exception 'validation'; end if;
  select id into year_id from public.academic_years where academy_id=p_academy_id and closed_at is null;
  record_id:=edra_private.student_caller_record(p_academy_id,year_id);
  if record_id is null then raise exception 'student_unavailable'; end if;
  select * into strict r from public.annual_student_records where id=record_id;
  with matches as (
    select u.id,v.document,v.published_at from public.content_units u
    join public.content_programs p on p.id=u.program_id
    join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
    where u.academy_id=p_academy_id and u.state='published' and p.academic_year_id=year_id
      and p.level_id=r.level_id and (p.track_id is null or p.track_id=r.track_id)
      and (coalesce(p_search,'')='' or position(lower(btrim(p_search)) in lower(v.document->>'title'))>0)
    order by v.published_at desc,u.id limit p_limit+1 offset p_offset
  ), page as (select * from matches order by published_at desc,id limit p_limit)
  select jsonb_build_object('units',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'title',document->>'title','materialCount',jsonb_array_length(document->'items'),'publishedAt',published_at,
    'access',edra_private.learning_state(record_id,id)) order by published_at desc,id) from page),'[]'::jsonb),
    'hasMore',(select count(*)>p_limit from matches)) into result;
  return result;
end $$;

create function public.get_my_content_unit(p_academy_id uuid,p_unit_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; record_id uuid; access jsonb; items jsonb;
begin
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  access:=edra_private.learning_state(record_id,p_unit_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',item->>'id','kind',item->>'kind','title',item->>'title',
    'available',item->>'kind' in ('explanation','document') and access->>'status'='active',
    'assessmentKind',item->>'assessmentKind') order by ordinal),'[]'::jsonb) into items
    from jsonb_array_elements(scope->'document'->'items') with ordinality x(item,ordinal);
  return jsonb_build_object('id',p_unit_id,'title',scope->'document'->>'title','description',scope->'document'->>'description',
    'accessDays',coalesce((scope->'document'->>'accessDays')::integer,7),'access',access,'items',items,
    'extensionAvailable',not exists(select 1 from edra_private.content_annual_extensions where academy_id=p_academy_id and academic_year_id=(scope->>'year')::uuid and annual_record_id=record_id));
end $$;

create function public.authorize_content_material(p_academy_id uuid,p_unit_id uuid,p_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; access jsonb; item jsonb; asset public.content_assets;
begin
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  access:=edra_private.learning_state((scope->>'record')::uuid,p_unit_id);
  if access->>'status'<>'active' then raise exception 'access_required'; end if;
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id'=p_item_id::text;
  if item is null or item->>'kind' not in ('explanation','document') then raise exception 'material_unavailable'; end if;
  select * into asset from public.content_assets where id=(item->>'assetId')::uuid and academy_id=p_academy_id and status='ready' and deletion_token is null for share;
  if not found or (item->>'kind'='document')<>(asset.kind='document') then raise exception 'material_unavailable'; end if;
  return jsonb_build_object('kind',asset.kind,'playbackId',asset.playback_id,'storagePath',asset.storage_path,'expiresAt',access->'expiresAt');
end $$;

create function public.get_content_access_workspace(p_academy_id uuid,p_unit_id uuid,p_search text default '',p_record_offset integer default 0,p_code_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.content_units; scope public.content_programs; closed boolean; doc jsonb; records jsonb; codes jsonb; more_records boolean; more_codes boolean;
begin
  perform edra_private.learning_actor(p_academy_id);
  if char_length(coalesce(p_search,''))>100 or p_record_offset is null or p_record_offset not between 0 and 100000 or p_code_offset is null or p_code_offset not between 0 and 100000 then raise exception 'validation'; end if;
  select * into u from public.content_units where id=p_unit_id and academy_id=p_academy_id;
  if not found then raise exception 'content_unavailable'; end if;
  select * into strict scope from public.content_programs where id=u.program_id;
  select closed_at is not null into closed from public.academic_years where id=scope.academic_year_id;
  select document into doc from public.content_revisions where unit_id=u.id and revision=u.published_revision;
  with matching as (
    select r.id,r.full_name,r.student_phone,profile.user_id is not null as connected,
      edra_private.student_access_suspended(r,profile) as suspended
    from public.annual_student_records r join public.academy_student_profiles profile on profile.id=r.academy_student_profile_id
    where r.academy_id=p_academy_id and r.academic_year_id=scope.academic_year_id
      and r.level_id=scope.level_id and (scope.track_id is null or r.track_id=scope.track_id)
      and (coalesce(p_search,'')='' or position(lower(btrim(p_search)) in lower(r.full_name))>0 or position(btrim(p_search) in r.student_phone)>0)
    order by lower(r.full_name),r.id limit 26 offset p_record_offset
  ), page as (select * from matching order by lower(full_name),id limit 25)
  select coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'phone',student_phone,'connected',connected,'suspended',suspended,
    'access',edra_private.learning_state(id,p_unit_id)) order by lower(full_name),id) from page),'[]'::jsonb),(select count(*)>25 from matching) into records,more_records;
  with matching as (
    select c.id,c.code,b.created_at,r.code_id is not null as redeemed,c.revoked_at is not null as revoked
      from public.content_access_codes c join public.content_code_batches b on b.id=c.batch_id
      left join public.content_code_redemptions r on r.code_id=c.id
      where c.academy_id=p_academy_id and c.unit_id=p_unit_id order by b.created_at desc,c.id limit 26 offset p_code_offset
  ), page as (select * from matching order by created_at desc,id limit 25)
  select coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'createdAt',created_at,'redeemed',redeemed,'revoked',revoked) order by created_at desc,id) from page),'[]'::jsonb),
    (select count(*)>25 from matching) into codes,more_codes;
  return jsonb_build_object('records',records,'recordsHasMore',more_records,'codes',codes,'codesHasMore',more_codes,
    'defaultDays',coalesce((doc->>'accessDays')::integer,7),'canIssue',u.state='published' and not closed,
    'manager',public.academy_role_for(p_academy_id) in ('owner','head_admin','admin'));
end $$;

create function public.get_content_access_history(p_academy_id uuid,p_unit_id uuid,p_record_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform edra_private.learning_actor(p_academy_id);
  if not exists(select 1 from public.content_units where id=p_unit_id and academy_id=p_academy_id) then raise exception 'content_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'kind',g.kind,'issuedAt',g.issued_at,'startsAt',g.starts_at,'expiresAt',g.expires_at,
    'previousExpiry',g.previous_expiry,'actorId',g.actor_id,'revokedAt',rev.revoked_at,'reason',rev.reason) order by g.issued_at desc,g.id),'[]'::jsonb) into result
    from (select * from public.content_access_grants where academy_id=p_academy_id and unit_id=p_unit_id and annual_record_id=p_record_id order by issued_at desc,id limit 100) g
    left join public.content_access_revocations rev on rev.grant_id=g.id;
  return result;
end $$;

revoke all on function public.list_my_content_units(uuid,integer,integer,text),public.get_my_content_unit(uuid,uuid),public.authorize_content_material(uuid,uuid,uuid),public.get_content_access_workspace(uuid,uuid,text,integer,integer),public.get_content_access_history(uuid,uuid,uuid) from public,anon;
grant execute on function public.list_my_content_units(uuid,integer,integer,text),public.get_my_content_unit(uuid,uuid),public.authorize_content_material(uuid,uuid,uuid),public.get_content_access_workspace(uuid,uuid,text,integer,integer),public.get_content_access_history(uuid,uuid,uuid) to authenticated;

commit;
