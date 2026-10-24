begin;
-- Type tabs filter batches by the first three letters of the type's current prefix.
drop function public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer);
create function public.get_content_coupon_batches(p_academy_id uuid,p_year_id uuid default null,p_level_id text default null,p_track_id uuid default null,p_search text default '',p_offset integer default 0,p_prefix text default null) returns jsonb
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
   and (p_track_id is null or t.all_tracks or t.track_id=p_track_id) and (p_prefix is null or left(t.prefix,3)=p_prefix)
   and (needle='' or position(lower(btrim(p_search)) in lower(t.name))>0 or exists(select 1 from public.content_coupons c where c.batch_id=b.id and position(needle in b.prefix||c.code)>0))
  order by b.created_at desc,b.id limit 26 offset p_offset
 ) select jsonb_build_object('manager',public.is_academy_manager(p_academy_id),'hasMore',(select count(*)>25 from page),
   'batches',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id) from (select * from page order by created_at desc,id limit 25)x),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer,text) from public,anon;
grant execute on function public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer,text) to authenticated;
commit;
