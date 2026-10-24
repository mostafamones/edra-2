begin;
alter table public.content_coupon_types add column all_tracks boolean not null default false, add constraint content_coupon_shared_scope check(not all_tracks or track_id is null);

create function edra_private.grade_coupon_program(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; result uuid;
begin
 select * into strict p from public.content_programs where id=p_program;
 perform pg_advisory_xact_lock(hashtextextended('coupon-grade:'||p.academy_id||':'||p.academic_year_id||':'||p.level_id,0));
 select id into result from public.content_programs where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is null order by id limit 1;
 if result is null then insert into public.content_programs(academy_id,academic_year_id,level_id) values(p.academy_id,p.academic_year_id,p.level_id) returning id into result; end if;
 return result;
end $$;
create or replace function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
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
end $$;
-- Change defaults without rewriting any existing unit's working or published selection.
update public.content_coupon_types set is_default=false where track_id is not null;
do $$ declare p uuid; begin
 for p in select cp.id from public.content_programs cp join public.academic_years y on y.id=cp.academic_year_id where y.closed_at is null loop perform edra_private.default_coupon_type(p); end loop;
end $$;

do $$ declare definition text; updated text; signature text;
begin
 definition:=pg_get_functiondef('public.create_content_coupon_type(uuid,uuid,text,uuid,text)'::regprocedure);
 updated:=replace(definition, 'p_prefix text DEFAULT ''TYPE''::text)', 'p_prefix text DEFAULT ''TYPE''::text, p_all_tracks boolean DEFAULT false)');
 updated:=replace(updated, 'p:=edra_private.coupon_program(p_academy_id,p_program_id);', 'p:=edra_private.coupon_program(p_academy_id,p_program_id); if p_all_tracks is null then raise exception ''validation''; end if; if p_all_tracks then p:=edra_private.coupon_program(p_academy_id,edra_private.grade_coupon_program(p.id)); end if;');
 updated:=replace(updated,'''prefix'',upper(btrim(p_prefix)))', '''prefix'',upper(btrim(p_prefix)),''allTracks'',p_all_tracks)');
 updated:=replace(updated,'created_by,prefix)', 'created_by,prefix,all_tracks)');
 updated:=replace(updated,'values(p_request_id,p_academy_id,p_program_id,', 'values(p_request_id,p_academy_id,p.id,');
 updated:=replace(updated,'auth.uid(),upper(btrim(p_prefix)))', 'auth.uid(),upper(btrim(p_prefix)),p_all_tracks)');
 if updated=definition or position('p_all_tracks boolean DEFAULT false' in updated)=0 then raise exception 'Shared coupon type contract changed'; end if;
 drop function public.create_content_coupon_type(uuid,uuid,text,uuid,text); execute updated;
 foreach signature in array array['edra_private.content_requirements(uuid,jsonb)','public.get_content_requirement_options(uuid,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'t.track_id is not distinct from p.track_id','(t.all_tracks or t.track_id is not distinct from p.track_id)');
  if updated=definition then raise exception 'Unit coupon scope contract changed'; end if; execute updated;
 end loop;
 definition:=pg_get_functiondef('public.redeem_content_coupon(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'or t.track_id is distinct from (scope->>''track'')::uuid','or (not t.all_tracks and t.track_id is distinct from (scope->>''track'')::uuid)');
 if updated=definition then raise exception 'Shared redemption contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_content_coupons(uuid,uuid,uuid,text,text,integer)'::regprocedure);
 updated:=replace(definition,'and p.track_id is not distinct from t.track_id','and (t.all_tracks or p.track_id is not distinct from t.track_id)');
 if updated=definition then raise exception 'Shared coupon list contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_content_coupon_options(uuid)'::regprocedure);
 updated:=replace(definition,'''isDefault'',is_default)', '''isDefault'',is_default,''allTracks'',all_tracks)');
 if updated=definition then raise exception 'Shared coupon options contract changed'; end if; execute updated;
end $$;
revoke all on function edra_private.grade_coupon_program(uuid) from public,anon,authenticated;
revoke all on function public.create_content_coupon_type(uuid,uuid,text,uuid,text,boolean) from public,anon;
grant execute on function public.create_content_coupon_type(uuid,uuid,text,uuid,text,boolean) to authenticated;
commit;
