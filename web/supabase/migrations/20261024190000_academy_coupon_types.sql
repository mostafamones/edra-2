begin;
-- Academy-wide coupon types belong to one academic year but no grade, track or program.
alter table public.content_coupon_types alter column level_id drop not null, alter column program_id drop not null,
 add constraint content_coupon_academy_scope check ((level_id is null)=(program_id is null) and (level_id is not null or (track_id is null and all_tracks)));
create unique index content_coupon_academy_type_name on public.content_coupon_types(academy_id,academic_year_id,lower(btrim(name))) where level_id is null and not retired;
create unique index content_coupon_academy_default on public.content_coupon_types(academy_id,academic_year_id) where level_id is null and is_default;

create function edra_private.academy_coupon_year(p_academy uuid,p_year uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.academic_years where academy_id=p_academy and id=p_year and closed_at is null for share;
 if not found then raise exception 'year_closed'; end if;
end $$;

-- Grade types keep their program/offering gate; academy types only need an open year.
create function edra_private.coupon_type_gate(p_academy uuid,p_type uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t public.content_coupon_types;
begin
 select * into t from public.content_coupon_types where id=p_type and academy_id=p_academy;
 if not found then raise exception 'validation'; end if;
 if t.level_id is null then perform edra_private.academy_coupon_year(p_academy,t.academic_year_id);
 else perform edra_private.coupon_program(p_academy,t.program_id); perform edra_private.require_offering(t.academy_id,t.level_id,t.track_id); end if;
end $$;

create function edra_private.academy_coupon_default(p_academy uuid,p_year uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; actor uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('coupon-academy-default:'||p_academy||':'||p_year,0));
 select id into result from public.content_coupon_types where academy_id=p_academy and academic_year_id=p_year and level_id is null and is_default;
 if found then return result; end if;
 select created_by into strict actor from public.academies where id=p_academy;
 update public.content_coupon_types set is_default=true where academy_id=p_academy and academic_year_id=p_year and level_id is null and not retired and lower(btrim(name))='regular' returning id into result;
 if result is null then
  insert into public.content_coupon_types(academy_id,academic_year_id,name,prefix,is_default,all_tracks,created_by)
  values(p_academy,p_year,'Regular','REG',true,true,coalesce(auth.uid(),actor)) returning id into result;
 end if;
 return result;
end $$;

-- Grade-scoped generation keeps its per-grade Regular.
create function edra_private.grade_coupon_default(p_program uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.content_programs; result uuid; actor uuid; root uuid;
begin
 root:=edra_private.grade_coupon_program(p_program);
 select * into strict p from public.content_programs where id=root;
 select id into result from public.content_coupon_types where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is null and is_default and all_tracks;
 if found then return result; end if;
 select created_by into strict actor from public.academies where id=p.academy_id;
 insert into public.content_coupon_types(academy_id,program_id,academic_year_id,level_id,track_id,name,prefix,is_default,all_tracks,created_by)
 values(p.academy_id,p.id,p.academic_year_id,p.level_id,null,'Regular','REG',true,true,coalesce(auth.uid(),actor)) on conflict do nothing;
 update public.content_coupon_types set is_default=true,all_tracks=true where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is null and lower(btrim(name))='regular' returning id into result;
 if result is null then raise exception 'unavailable'; end if;
 return result;
end $function$;
-- New units and copies use the academy-wide Regular; existing selections are untouched.
create or replace function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs;
begin
 select * into strict p from public.content_programs where id=p_program;
 return edra_private.academy_coupon_default(p.academy_id,p.academic_year_id);
end $$;

create function public.create_academy_coupon_type(p_academy_id uuid,p_year_id uuid,p_name text,p_prefix text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; retry jsonb; result jsonb;
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 perform edra_private.academy_coupon_year(p_academy_id,p_year_id);
 if p_name is null or char_length(btrim(p_name)) not between 1 and 80 or p_prefix is null or upper(btrim(p_prefix)) !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if;
 payload:=jsonb_build_object('year',p_year_id,'name',btrim(p_name),'prefix',upper(btrim(p_prefix)));
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_type',payload); if retry is not null then return retry; end if;
 begin
  insert into public.content_coupon_types(id,academy_id,academic_year_id,name,prefix,all_tracks,created_by)
  values(p_request_id,p_academy_id,p_year_id,btrim(p_name),upper(btrim(p_prefix)),true,auth.uid());
 exception when unique_violation then raise exception 'coupon_type_exists'; end;
 result:=jsonb_build_object('id',p_request_id);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_type',payload,result);
end $$;
create function public.generate_academy_default_coupons(p_academy_id uuid,p_year_id uuid,p_quantity integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 perform edra_private.academy_coupon_year(p_academy_id,p_year_id);
 return public.generate_content_coupons(p_academy_id,edra_private.academy_coupon_default(p_academy_id,p_year_id),p_quantity,p_request_id);
end $$;
create or replace function public.generate_default_coupons(p_academy_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_quantity integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.generate_content_coupons(p_academy_id,edra_private.grade_coupon_default(edra_private.coupon_scope_program(p_academy_id,p_year_id,p_level_id,p_track_id)),p_quantity,p_request_id);
end $$;
create or replace function public.change_default_coupon_prefix(p_academy_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_prefix text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.change_content_coupon_prefix(p_academy_id,edra_private.grade_coupon_default(edra_private.coupon_scope_program(p_academy_id,p_year_id,p_level_id,p_track_id)),p_prefix,p_request_id);
end $$;
create function public.change_academy_default_prefix(p_academy_id uuid,p_year_id uuid,p_prefix text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 perform edra_private.academy_coupon_year(p_academy_id,p_year_id);
 return public.change_content_coupon_prefix(p_academy_id,edra_private.academy_coupon_default(p_academy_id,p_year_id),p_prefix,p_request_id);
end $$;

do $$ declare definition text; updated text; signature text;
begin
 definition:=pg_get_functiondef('public.generate_content_coupons(uuid,uuid,integer,uuid)'::regprocedure);
 updated:=replace(definition,'perform edra_private.coupon_program(p_academy_id,t.program_id);
  perform edra_private.require_offering(t.academy_id,t.level_id,t.track_id);','perform edra_private.coupon_type_gate(p_academy_id,t.id);');
 if updated=definition then raise exception 'Generation gate changed'; end if; execute updated;
 foreach signature in array array['public.change_content_coupon_prefix(uuid,uuid,text,uuid)','public.rename_content_coupon_type(uuid,uuid,text,uuid)','public.delete_content_coupon_type(uuid,uuid,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'perform edra_private.coupon_program(p_academy_id,t.program_id);','perform edra_private.coupon_type_gate(p_academy_id,t.id);');
  if updated=definition then raise exception 'Type gate changed: %',signature; end if; execute updated;
 end loop;
 definition:=pg_get_functiondef('public.revoke_content_coupon(uuid,uuid,uuid)'::regprocedure);
 updated:=replace(definition,'perform edra_private.coupon_program(p_academy_id,(select program_id from public.content_coupon_types where id=c.type_id));','perform edra_private.coupon_type_gate(p_academy_id,c.type_id);');
 if updated=definition then raise exception 'Revoke gate changed'; end if; execute updated;
 foreach signature in array array['edra_private.content_requirements(uuid,jsonb)','public.get_content_requirement_options(uuid,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'t.level_id=p.level_id and (t.all_tracks or t.track_id is not distinct from p.track_id)','(t.level_id is null or (t.level_id=p.level_id and (t.all_tracks or t.track_id is not distinct from p.track_id)))');
  if updated=definition then raise exception 'Unit type scope changed: %',signature; end if; execute updated;
 end loop;
 definition:=pg_get_functiondef('public.redeem_content_coupon(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'or t.level_id<>scope->>''level''','or (t.level_id is not null and t.level_id<>scope->>''level'')');
 if updated=definition then raise exception 'Redemption scope changed'; end if; execute updated;
end $$;

-- Batch list: academy-wide batches have no grade; p_academy_wide narrows to them.
drop function public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer,text);
create function public.get_content_coupon_batches(p_academy_id uuid,p_year_id uuid default null,p_level_id text default null,p_track_id uuid default null,p_search text default '',p_offset integer default 0,p_prefix text default null,p_academy_wide boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; needle text:=upper(regexp_replace(coalesce(p_search,''),'[[:space:]-]','','g'));
begin
 perform edra_private.learning_actor(p_academy_id);
 if p_offset is null or p_offset not between 0 and 100000 or char_length(coalesce(p_search,''))>100 or p_academy_wide is null then raise exception 'validation'; end if;
 with page as (
  select b.id,b.created_at,b.prefix,b.quantity,t.name as type_name,g.name as level,case when t.all_tracks then null else a.name end as track,
   pr.full_name as created_by_name,y.closed_at is not null as closed,s.redeemed,s.revoked
  from public.content_coupon_batches b join public.content_coupon_types t on t.id=b.type_id
  join public.academic_years y on y.id=t.academic_year_id left join public.global_levels g on g.id=t.level_id
  left join public.academy_tracks a on a.id=t.track_id left join public.profiles pr on pr.id=b.created_by
  cross join lateral(select count(r.coupon_id) as redeemed,count(*) filter(where r.coupon_id is null and c.revoked_at is not null) as revoked
   from public.content_coupons c left join public.content_coupon_redemptions r on r.coupon_id=c.id where c.batch_id=b.id) s
  where b.academy_id=p_academy_id and (p_year_id is null or t.academic_year_id=p_year_id) and (p_level_id is null or t.level_id=p_level_id)
   and (not p_academy_wide or t.level_id is null)
   and (p_track_id is null or t.all_tracks or t.track_id=p_track_id) and (p_prefix is null or left(t.prefix,3)=p_prefix)
   and (needle='' or position(lower(btrim(p_search)) in lower(t.name))>0 or exists(select 1 from public.content_coupons c where c.batch_id=b.id and position(needle in b.prefix||c.code)>0))
  order by b.created_at desc,b.id limit 26 offset p_offset
 ) select jsonb_build_object('manager',public.is_academy_manager(p_academy_id),'hasMore',(select count(*)>25 from page),
   'batches',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id) from (select * from page order by created_at desc,id limit 25)x),'[]'::jsonb)) into result;
 return result;
end $$;

-- Existing open years get their academy-wide Regular now; later years get it lazily.
do $$ declare y record; begin
 for y in select academy_id,id from public.academic_years where closed_at is null loop perform edra_private.academy_coupon_default(y.academy_id,y.id); end loop;
end $$;

revoke all on function edra_private.grade_coupon_default(uuid),edra_private.academy_coupon_year(uuid,uuid),edra_private.coupon_type_gate(uuid,uuid),edra_private.academy_coupon_default(uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_academy_coupon_type(uuid,uuid,text,text,uuid),public.generate_academy_default_coupons(uuid,uuid,integer,uuid),public.change_academy_default_prefix(uuid,uuid,text,uuid),public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer,text,boolean) from public,anon;
grant execute on function public.create_academy_coupon_type(uuid,uuid,text,text,uuid),public.generate_academy_default_coupons(uuid,uuid,integer,uuid),public.change_academy_default_prefix(uuid,uuid,text,uuid),public.get_content_coupon_batches(uuid,uuid,text,uuid,text,integer,text,boolean) to authenticated;
commit;
