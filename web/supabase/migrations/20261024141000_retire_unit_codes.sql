-- Owner approved deleting all legacy unit codes and their redemption history.
-- Access grants, revocations and annual extension history remain intact.
begin;
drop function public.get_content_access_workspace(uuid,uuid,text,integer,integer);
create function public.get_content_access_workspace(p_academy_id uuid,p_unit_id uuid,p_search text default '',p_record_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.content_units; scope public.content_programs; closed boolean; doc jsonb; records jsonb; more_records boolean;
begin
  perform edra_private.learning_actor(p_academy_id);
  if char_length(coalesce(p_search,''))>100 or p_record_offset is null or p_record_offset not between 0 and 100000 then raise exception 'validation'; end if;
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
  return jsonb_build_object('records',records,'recordsHasMore',more_records,
    'publishedRevision',u.published_revision,'defaultDays',coalesce((doc->>'accessDays')::integer,7),'canIssue',u.state='published' and not closed,
    'manager',public.academy_role_for(p_academy_id) in ('owner','head_admin','admin'));
end $$;

revoke all on function public.get_content_access_workspace(uuid,uuid,text,integer) from public,anon;
grant execute on function public.get_content_access_workspace(uuid,uuid,text,integer) to authenticated;
do $$
declare definition text; corrected text;
begin
 definition:=pg_get_functiondef('public.redeem_content_coupon(uuid,uuid,text,uuid)'::regprocedure);
 corrected:=replace(definition, E'\n      or exists(select 1 from public.content_code_redemptions where annual_record_id=record_id and unit_id=p_unit_id)', '');
 if corrected=definition then raise exception 'Legacy redemption guard changed'; end if;
 execute corrected;
end $$;
drop function public.generate_content_codes(uuid,uuid,uuid,integer);
drop function public.revoke_content_code(uuid,uuid,uuid,uuid);
drop function public.redeem_content_code(uuid,uuid,text,uuid);
-- Request receipts contain the old codes too. Remove only these three operations.
alter table edra_private.content_access_requests disable trigger content_request_history;
delete from edra_private.content_access_requests where operation in ('generate','revoke_code','redeem');
alter table edra_private.content_access_requests enable trigger content_request_history;
drop table public.content_code_redemptions;
drop table public.content_access_codes;
drop table public.content_code_batches;
commit;
