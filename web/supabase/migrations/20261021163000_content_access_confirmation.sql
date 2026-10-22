begin;
-- A staff confirmation is bound to the publication and access state reviewed in the UI.
create function public.confirm_content_access(p_academy_id uuid,p_unit_id uuid,p_record_id uuid,p_request_id uuid,p_expected_grant_id uuid,p_expected_revision integer,p_extension_hours integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; retry jsonb; current_id uuid; revision integer;
begin
  perform edra_private.learning_actor(p_academy_id);
  scope:=edra_private.learning_publication(p_academy_id,p_unit_id);
  perform edra_private.learning_record(p_academy_id,scope,p_record_id);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'staff',jsonb_build_object('unit',p_unit_id,'record',p_record_id,'hours',p_extension_hours));
  if retry is not null then return retry; end if;
  if p_expected_revision is null or p_expected_revision<1 then raise exception 'validation'; end if;
  insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id) values(p_academy_id,(scope->>'year')::uuid,p_record_id,p_unit_id) on conflict do nothing;
  select current_grant_id into current_id from public.content_access_accounts where annual_record_id=p_record_id and unit_id=p_unit_id for update;
  select published_revision into revision from public.content_units where id=p_unit_id;
  if current_id is distinct from p_expected_grant_id or revision<>p_expected_revision then raise exception 'content_conflict'; end if;
  return public.issue_content_access(p_academy_id,p_unit_id,p_record_id,p_request_id,p_extension_hours);
end $$;
revoke all on function public.confirm_content_access(uuid,uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.confirm_content_access(uuid,uuid,uuid,uuid,uuid,integer,integer) to authenticated;
create or replace function public.get_content_access_workspace(p_academy_id uuid,p_unit_id uuid,p_search text default '',p_record_offset integer default 0,p_code_offset integer default 0) returns jsonb
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
    'publishedRevision',u.published_revision,'defaultDays',coalesce((doc->>'accessDays')::integer,7),'canIssue',u.state='published' and not closed,
    'manager',public.academy_role_for(p_academy_id) in ('owner','head_admin','admin'));
end $$;
commit;
