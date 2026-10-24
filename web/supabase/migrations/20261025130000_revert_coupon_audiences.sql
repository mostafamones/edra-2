-- Reverts the coupon migrations applied from codex/coupon-type-management
-- (20261025100000, 20261025110000, 20261025123000, 20261025124000) and restores the
-- academy-wide coupon contract from 20261024190000. Function bodies are the exact
-- definitions those migrations replaced. Issued batches are never rewritten, so the
-- batch prefix check keeps accepting the hyphenated prefixes printed in the meantime.
begin;
drop trigger coupon_audience_guard on public.content_coupon_types;
drop index public.content_coupon_printed_prefix;

-- Data: academy-wide types were retired and grade prefixes became "<grade>-<track>-<suffix>".
update public.content_coupon_types set retired=false where level_id is null and retired;
update public.content_coupon_types set prefix=substring(prefix from '([A-Z]{2,4})$') where prefix like '%-%';
alter table public.content_coupon_types drop constraint content_coupon_types_prefix_check;
alter table public.content_coupon_types add constraint content_coupon_types_prefix_check check(prefix ~ '^[A-Z]{2,4}$');

-- New units and copies use the academy-wide Regular; existing selections are untouched.
create or replace function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs;
begin
 select * into strict p from public.content_programs where id=p_program;
 return edra_private.academy_coupon_default(p.academy_id,p.academic_year_id);
end $$;

CREATE OR REPLACE FUNCTION edra_private.content_requirements(p_unit uuid, p_document jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u public.content_units; source public.content_units; requirement jsonb; source_document jsonb; requirements jsonb;
begin
  select * into strict u from public.content_units where id=p_unit;
  perform pg_advisory_xact_lock(hashtextextended('content-requirements:'||u.academy_id::text,0));
  if p_document ? 'couponTypeId' and p_document->'couponTypeId'<>'null'::jsonb then
    if jsonb_typeof(p_document->'couponTypeId')<>'string' then raise exception 'validation'; end if;
    perform 1 from public.content_coupon_types t join public.content_programs p on p.id=u.program_id
      where not t.retired and t.id=(p_document->>'couponTypeId')::uuid and t.academy_id=u.academy_id
        and t.academic_year_id=p.academic_year_id and (t.level_id is null or (t.level_id=p.level_id and (t.all_tracks or t.track_id is not distinct from p.track_id)));
    if not found then raise exception 'coupon_type_mismatch'; end if;
  end if;
  requirements:=coalesce(p_document->'prerequisites','[]'::jsonb);
  if jsonb_typeof(requirements) is distinct from 'array' then raise exception 'validation'; end if;
  if jsonb_array_length(requirements)>100 then raise exception 'validation'; end if;
  if (select count(distinct value) from jsonb_array_elements(requirements))<>jsonb_array_length(requirements) then raise exception 'validation'; end if;
  for requirement in select value from jsonb_array_elements(requirements) loop
    if jsonb_typeof(requirement) is distinct from 'object'
      or requirement-array['unitId','kind','assessmentId']<>'{}'::jsonb
      or jsonb_typeof(requirement->'unitId') is distinct from 'string'
      or jsonb_typeof(requirement->'assessmentId') is distinct from 'string'
      or coalesce(requirement->>'kind','') not in ('assignment','quiz') then raise exception 'validation'; end if;
    select candidate.* into source from public.content_units candidate
      join public.content_programs sp on sp.id=candidate.program_id
      join public.content_programs tp on tp.id=u.program_id
      where candidate.id=(requirement->>'unitId')::uuid and candidate.academy_id=u.academy_id and candidate.state='published'
        and sp.academic_year_id=tp.academic_year_id and sp.level_id=tp.level_id and sp.track_id is not distinct from tp.track_id;
    if not found or source.id=u.id then raise exception 'invalid_prerequisite'; end if;
    select document into strict source_document from public.content_revisions where unit_id=source.id and revision=source.published_revision;
    if not exists(select 1 from jsonb_array_elements(source_document->'items') item
      where item->>'kind'='assessment' and item->>'assessmentKind'=requirement->>'kind'
        and item->>'assessmentId'=requirement->>'assessmentId') then raise exception 'invalid_prerequisite'; end if;
  end loop;
  -- A serialized publication cannot introduce a cycle in the published graph.
  if exists(with recursive dependencies(id) as (
    select (value->>'unitId')::uuid from jsonb_array_elements(requirements)
    union
    select (r.value->>'unitId')::uuid from dependencies d
      join public.content_units x on x.id=d.id and x.academy_id=u.academy_id
      join public.content_revisions v on v.unit_id=x.id and v.revision=x.published_revision
      cross join lateral jsonb_array_elements(coalesce(v.document->'prerequisites','[]'::jsonb)) r(value)
  ) select 1 from dependencies where id=u.id) then raise exception 'prerequisite_cycle'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.get_content_requirement_options(p_academy_id uuid, p_unit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.content_units;
begin
  perform edra_private.learning_actor(p_academy_id);
  select * into target from public.content_units where id=p_unit_id and academy_id=p_academy_id;
  if not found then raise exception 'content_unavailable'; end if;
  return jsonb_build_object('types',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
    from public.content_coupon_types t join public.content_programs p on p.id=target.program_id
      where t.academy_id=p_academy_id and not t.retired and t.academic_year_id=p.academic_year_id
        and (t.level_id is null or (t.level_id=p.level_id and (t.all_tracks or t.track_id is not distinct from p.track_id)))),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'title',v.document->>'title','assessments',
      (select jsonb_agg(jsonb_build_object('id',item->>'assessmentId','kind',item->>'assessmentKind','title',item->>'title') order by ordinal)
        from jsonb_array_elements(v.document->'items') with ordinality x(item,ordinal)
        where item->>'kind'='assessment' and item->>'assessmentKind' in ('assignment','quiz'))) order by v.published_at desc,u.id)
      from public.content_units u join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
      join public.content_programs sp on sp.id=u.program_id join public.content_programs tp on tp.id=target.program_id
      where u.academy_id=p_academy_id and sp.academic_year_id=tp.academic_year_id and sp.level_id=tp.level_id
        and sp.track_id is not distinct from tp.track_id and u.id<>target.id and u.state='published'),'[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.redeem_content_coupon(p_academy_id uuid, p_unit_id uuid, p_code text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scope jsonb; payload jsonb; retry jsonb; result jsonb; record_id uuid; c public.content_coupons; t public.content_coupon_types;
  program_id uuid; normalized text; attempt_count integer;
begin
  perform edra_private.offering_gate();
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  normalized:=upper(regexp_replace(coalesce(p_code,''),'[[:space:]-]','','g'));
  payload:=jsonb_build_object('unit',p_unit_id,'code',normalized);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_redeem',payload);
  if retry is not null then return retry; end if;
  insert into edra_private.content_coupon_attempts(academy_id,actor_id,window_start,attempts)
    values(p_academy_id,auth.uid(),clock_timestamp(),1)
    on conflict(academy_id,actor_id) do update set
      attempts=case when content_coupon_attempts.window_start<=clock_timestamp()-interval '10 minutes' then 1 else content_coupon_attempts.attempts+1 end,
      window_start=case when content_coupon_attempts.window_start<=clock_timestamp()-interval '10 minutes' then clock_timestamp() else content_coupon_attempts.window_start end
    returning attempts into attempt_count;
  if attempt_count>20 then return jsonb_build_object('error','coupon_rate_limited'); end if;
  -- Business denials are returned, not raised outside this subtransaction: the
  -- throttle survives a failed attempt while code/grant mutations roll back.
  begin
    if normalized !~ '^([A-Z]{2,4})?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then raise exception 'code_unavailable'; end if;
    insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id)
      values(p_academy_id,(scope->>'year')::uuid,record_id,p_unit_id) on conflict do nothing;
    perform 1 from public.content_access_accounts where annual_record_id=record_id and unit_id=p_unit_id for update;
    select * into c from public.content_coupons where academy_id=p_academy_id and code=right(normalized,8) for update;
    if not found or c.revoked_at is not null or exists(select 1 from public.content_coupon_redemptions where coupon_id=c.id) then raise exception 'code_unavailable'; end if;
    if length(normalized)>8 and left(normalized,length(normalized)-8)<>(select prefix from public.content_coupon_batches where id=c.batch_id) then raise exception 'code_unavailable'; end if; select * into strict t from public.content_coupon_types where id=c.type_id;
    select u.program_id into strict program_id from public.content_units u where u.id=p_unit_id;
    if t.academic_year_id<>(scope->>'year')::uuid or (t.level_id is not null and t.level_id<>scope->>'level')
      or (not t.all_tracks and t.track_id is distinct from (scope->>'track')::uuid)
      or (scope->'document'->>'couponTypeId')::uuid is distinct from t.id then raise exception 'coupon_type_mismatch'; end if;
    -- Serialize both the new and legacy redemption paths for this student/unit.
    perform pg_advisory_xact_lock(hashtextextended('learning-coupon:'||record_id::text||':'||p_unit_id::text,0));
    if exists(select 1 from public.content_coupon_redemptions where annual_record_id=record_id and unit_id=p_unit_id) then raise exception 'code_used'; end if;
    result:=edra_private.learning_issue(p_request_id,p_academy_id,scope,record_id,p_unit_id,'code',coalesce((scope->'document'->>'accessDays')::bigint,7)*86400);
    insert into public.content_coupon_redemptions(coupon_id,annual_record_id,unit_id,grant_id) values(c.id,record_id,p_unit_id,p_request_id);
    return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_redeem',payload,result);
  exception when others then
    return jsonb_build_object('error',case when sqlerrm in ('code_unavailable','code_used','coupon_type_mismatch','prerequisites_required','validation','request_conflict') then sqlerrm else 'unavailable' end);
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.get_scoped_content_coupons(p_academy_id uuid, p_year_id uuid, p_level_id text, p_track_id uuid, p_type_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; manager boolean;
begin
  perform edra_private.learning_actor(p_academy_id);
  if p_offset is null or p_offset not between 0 and 100000 or p_status is null or p_status not in ('all','unused','redeemed','revoked')
    or char_length(coalesce(p_search,''))>100 then raise exception 'validation'; end if;
  manager:=public.is_academy_manager(p_academy_id);
  with matches as (
    select c.id,c.code,b.prefix,c.type_id,t.name as type_name,b.created_at,c.revoked_at,r.redeemed_at,r.unit_id,
      case when r.coupon_id is not null then 'redeemed' when c.revoked_at is not null then 'revoked' else 'unused' end as status,
      ar.full_name as student_name,cr.document->>'title' as unit_title
    from public.content_coupons c join public.content_coupon_types t on t.id=c.type_id
    join public.content_coupon_batches b on b.id=c.batch_id
    left join public.content_coupon_redemptions r on r.coupon_id=c.id
    left join public.annual_student_records ar on ar.id=r.annual_record_id
    left join public.content_units u on u.id=r.unit_id
    left join public.content_revisions cr on cr.unit_id=u.id and cr.revision=u.published_revision
    where c.academy_id=p_academy_id and (t.academic_year_id=p_year_id and t.level_id=p_level_id and (t.all_tracks or t.track_id is not distinct from p_track_id))
      and (p_type_id is null or c.type_id=p_type_id)
      and (coalesce(p_search,'')='' or position(upper(regexp_replace(p_search,'[[:space:]-]','','g')) in c.code)>0)
  ), page as (
    select * from matches where p_status='all' or status=p_status order by created_at desc,id limit 26 offset p_offset
  )
  select jsonb_build_object('manager',manager,'codes',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id)
    from (select * from page order by created_at desc,id limit 25)x),'[]'::jsonb),'hasMore',(select count(*)>25 from page)) into result;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_content_coupon_options(p_academy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform edra_private.learning_actor(p_academy_id);
 return jsonb_build_object('programs',coalesce((
  with scopes as (
   select y.id as year_id,y.start_year,y.closed_at,l.level_id,g.name as level,g.sort_order,t.id as track_id,t.name as track
    from public.academic_years y join public.academy_levels l on l.academy_id=y.academy_id
    join public.global_levels g on g.id=l.level_id
    cross join lateral(select null::uuid as id,null::text as name union all select a.id,a.name from public.academy_tracks a where a.academy_id=l.academy_id and a.level_id=l.level_id and a.retired_at is null) t
    where y.academy_id=p_academy_id and y.closed_at is null and l.stopped_at is null
   union
   select y.id,y.start_year,y.closed_at,p.level_id,g.name,g.sort_order,t.id,t.name from public.content_programs p
    join public.academic_years y on y.id=p.academic_year_id join public.global_levels g on g.id=p.level_id left join public.academy_tracks t on t.id=p.track_id
    where p.academy_id=p_academy_id and y.closed_at is not null
  ) select jsonb_agg(jsonb_build_object('id',md5(year_id::text||':'||level_id||':'||coalesce(track_id::text,''))::uuid,'yearId',year_id,'year',start_year,'closed',closed_at is not null,'levelId',level_id,'level',level,'trackId',track_id,'track',track) order by start_year desc,sort_order,track nulls first) from scopes),'[]'::jsonb),
  'types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'programId',program_id,'yearId',academic_year_id,'levelId',level_id,'trackId',track_id,'name',name,'prefix',prefix,'isDefault',is_default,'allTracks',all_tracks) order by name,id) from public.content_coupon_types where academy_id=p_academy_id and not retired),'[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.change_content_coupon_prefix(p_academy_id uuid, p_type_id uuid, p_prefix text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb; retry jsonb; result jsonb; t public.content_coupon_types; normalized text:=upper(btrim(p_prefix));
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 if normalized is null or normalized !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if;
 payload:=jsonb_build_object('type',p_type_id,'prefix',normalized);
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_prefix',payload); if retry is not null then return retry; end if;
 select * into t from public.content_coupon_types where academy_id=p_academy_id and id=p_type_id and not retired for update;
 if not found then raise exception 'validation'; end if;
 perform edra_private.coupon_type_gate(p_academy_id,t.id);
 update public.content_coupon_types set prefix=normalized where id=t.id;
 result:=jsonb_build_object('prefix',normalized);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_prefix',payload,result);
end $function$;

CREATE OR REPLACE FUNCTION public.create_content_coupon_type(p_academy_id uuid, p_program_id uuid, p_name text, p_request_id uuid, p_prefix text DEFAULT 'TYPE'::text, p_all_tracks boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb; retry jsonb; result jsonb; p public.content_programs;
begin
  perform edra_private.offering_gate();
  perform edra_private.learning_actor(p_academy_id);
  p:=edra_private.coupon_program(p_academy_id,p_program_id); if p_all_tracks is null then raise exception 'validation'; end if; if p_all_tracks then p:=edra_private.coupon_program(p_academy_id,edra_private.grade_coupon_program(p.id)); end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'validation'; end if;
  if p_prefix is null or upper(btrim(p_prefix)) !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if; payload:=jsonb_build_object('program',p_program_id,'name',btrim(p_name),'prefix',upper(btrim(p_prefix)),'allTracks',p_all_tracks);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_type',payload);
  if retry is not null then return retry; end if;
  begin
    insert into public.content_coupon_types(id,academy_id,program_id,academic_year_id,level_id,track_id,name,created_by,prefix,all_tracks)
      values(p_request_id,p_academy_id,p.id,p.academic_year_id,p.level_id,p.track_id,btrim(p_name),auth.uid(),upper(btrim(p_prefix)),p_all_tracks);
  exception when unique_violation then raise exception 'coupon_type_exists'; end;
  result:=jsonb_build_object('id',p_request_id);
  return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_type',payload,result);
end $function$;

drop function public.update_scoped_coupon_type(uuid,uuid,uuid,text,uuid,text,text,uuid);
drop function public.remove_content_coupon_type(uuid,uuid,uuid);
drop function edra_private.unit_coupon_allowed(uuid,uuid);
drop function edra_private.coupon_audience_guard();
drop function edra_private.coupon_full_prefix(uuid,text,uuid);
drop function edra_private.coupon_program_prefix(uuid);
drop function edra_private.coupon_audience_prefix(uuid,uuid,text,uuid);
drop index public.content_program_coupon_prefix;
alter table public.content_programs drop column coupon_prefix;
commit;
