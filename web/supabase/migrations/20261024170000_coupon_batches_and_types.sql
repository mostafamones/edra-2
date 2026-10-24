begin;
create function public.rename_content_coupon_type(p_academy_id uuid,p_type_id uuid,p_name text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; retry jsonb; result jsonb; t public.content_coupon_types;
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'validation'; end if;
 payload:=jsonb_build_object('type',p_type_id,'name',btrim(p_name));
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_rename',payload); if retry is not null then return retry; end if;
 select * into t from public.content_coupon_types where academy_id=p_academy_id and id=p_type_id and not retired for update;
 if not found then raise exception 'validation'; end if;
 perform edra_private.coupon_program(p_academy_id,t.program_id);
 begin update public.content_coupon_types set name=btrim(p_name) where id=t.id;
 exception when unique_violation then raise exception 'coupon_type_exists'; end;
 result:=jsonb_build_object('name',btrim(p_name));
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_rename',payload,result);
end $$;

-- Deleting retires the type: issued coupons and their history stay, new use is blocked.
create function public.delete_content_coupon_type(p_academy_id uuid,p_type_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; retry jsonb; result jsonb; t public.content_coupon_types;
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id,true);
 payload:=jsonb_build_object('type',p_type_id);
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_delete',payload); if retry is not null then return retry; end if;
 select * into t from public.content_coupon_types where academy_id=p_academy_id and id=p_type_id and not retired for update;
 if not found or t.is_default then raise exception 'validation'; end if;
 perform edra_private.coupon_program(p_academy_id,t.program_id);
 if exists(select 1 from public.content_units u where u.academy_id=p_academy_id and u.draft->>'couponTypeId'=t.id::text)
  or exists(select 1 from public.content_revisions v where v.document->>'couponTypeId'=t.id::text) then raise exception 'coupon_type_in_use'; end if;
 update public.content_coupon_types set retired=true where id=t.id;
 result:=jsonb_build_object('deleted',true);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_delete',payload,result);
end $$;
revoke all on function public.rename_content_coupon_type(uuid,uuid,text,uuid),public.delete_content_coupon_type(uuid,uuid,uuid) from public,anon;
grant execute on function public.rename_content_coupon_type(uuid,uuid,text,uuid),public.delete_content_coupon_type(uuid,uuid,uuid) to authenticated;
create index content_coupons_batch on public.content_coupons(batch_id);
create index content_coupon_batches_recent on public.content_coupon_batches(academy_id,created_at desc,id);

-- Academy-wide batch list; the optional scope narrows by grade and, when given, track.
create function public.get_content_coupon_batches(p_academy_id uuid,p_year_id uuid default null,p_level_id text default null,p_track_id uuid default null,p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; needle text:=upper(regexp_replace(coalesce(p_search,''),'[[:space:]-]','','g'));
begin
 perform edra_private.learning_actor(p_academy_id);
 if p_offset is null or p_offset not between 0 and 100000 or char_length(coalesce(p_search,''))>100 then raise exception 'validation'; end if;
 with page as (
  select b.id,b.created_at,b.prefix,b.quantity,t.name as type_name,g.name as level,case when t.all_tracks then null else a.name end as track,
   pr.full_name as created_by_name,y.closed_at is not null as closed,s.redeemed,s.revoked
  from public.content_coupon_batches b join public.content_coupon_types t on t.id=b.type_id
  join public.academic_years y on y.id=t.academic_year_id join public.global_levels g on g.id=t.level_id
  left join public.academy_tracks a on a.id=t.track_id left join public.profiles pr on pr.id=b.created_by
  cross join lateral(select count(r.coupon_id) as redeemed,count(*) filter(where r.coupon_id is null and c.revoked_at is not null) as revoked
   from public.content_coupons c left join public.content_coupon_redemptions r on r.coupon_id=c.id where c.batch_id=b.id) s
  where b.academy_id=p_academy_id and (p_year_id is null or t.academic_year_id=p_year_id) and (p_level_id is null or t.level_id=p_level_id)
   and (p_track_id is null or t.all_tracks or t.track_id=p_track_id)
   and (needle='' or position(lower(btrim(p_search)) in lower(t.name))>0 or exists(select 1 from public.content_coupons c where c.batch_id=b.id and position(needle in b.prefix||c.code)>0))
  order by b.created_at desc,b.id limit 26 offset p_offset
 ) select jsonb_build_object('manager',public.is_academy_manager(p_academy_id),'hasMore',(select count(*)>25 from page),
   'batches',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id) from (select * from page order by created_at desc,id limit 25)x),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.get_content_coupon_batch(p_academy_id uuid,p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform edra_private.learning_actor(p_academy_id);
 perform 1 from public.content_coupon_batches where id=p_batch_id and academy_id=p_academy_id;
 if not found then raise exception 'validation'; end if;
 select jsonb_build_object('manager',public.is_academy_manager(p_academy_id),'codes',coalesce(jsonb_agg(to_jsonb(x) order by x.code),'[]'::jsonb)) into result from (
  select c.id,c.code,b.prefix,case when r.coupon_id is not null then 'redeemed' when c.revoked_at is not null then 'revoked' else 'unused' end as status,
   r.redeemed_at,ar.full_name as student_name,cr.document->>'title' as unit_title
  from public.content_coupons c join public.content_coupon_batches b on b.id=c.batch_id
  left join public.content_coupon_redemptions r on r.coupon_id=c.id
  left join public.annual_student_records ar on ar.id=r.annual_record_id
  left join public.content_units u on u.id=r.unit_id
  left join public.content_revisions cr on cr.unit_id=u.id and cr.revision=u.published_revision
  where c.batch_id=p_batch_id and c.academy_id=p_academy_id) x;
 return result;
end $$;
revoke all on function public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer),public.get_content_coupon_batch(uuid,uuid) from public,anon;
grant execute on function public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer),public.get_content_coupon_batch(uuid,uuid) to authenticated;
commit;
