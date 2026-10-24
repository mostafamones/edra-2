begin;
alter table public.content_coupon_types add column retired boolean not null default false;
-- Retire only unused automatic per-track defaults left by the earlier default rollout.
-- Explicitly created types and every referenced type remain available.
update public.content_coupon_types t set retired=true
 where not t.is_default and not t.all_tracks and t.track_id is not null and lower(btrim(t.name))='regular' and t.prefix='REG'
 and exists(select 1 from public.content_coupon_types d where d.academy_id=t.academy_id and d.academic_year_id=t.academic_year_id and d.level_id=t.level_id and d.is_default and d.all_tracks)
 and not exists(select 1 from public.content_coupon_batches b where b.type_id=t.id)
 and not exists(select 1 from public.content_units u where u.draft->>'couponTypeId'=t.id::text)
 and not exists(select 1 from public.content_revisions v where v.document->>'couponTypeId'=t.id::text)
 and not exists(select 1 from edra_private.content_access_requests r where r.operation='coupon_type' and r.result->>'id'=t.id::text);
drop index public.content_coupon_type_name;
create unique index content_coupon_type_name on public.content_coupon_types(academy_id,academic_year_id,level_id,coalesce(track_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name))) where not retired;

create function edra_private.coupon_scope_program(p_academy uuid,p_year uuid,p_level text,p_track uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy);
 perform 1 from public.academic_years where academy_id=p_academy and id=p_year and closed_at is null for share;
 if not found then raise exception 'year_closed'; end if;
 perform edra_private.require_offering(p_academy,p_level,p_track);
 perform pg_advisory_xact_lock(hashtextextended(p_academy||':'||p_year||':'||p_level||':'||coalesce(p_track::text,''),0));
 select id into result from public.content_programs where academy_id=p_academy and academic_year_id=p_year and level_id=p_level and track_id is not distinct from p_track order by id limit 1;
 if result is null then insert into public.content_programs(academy_id,academic_year_id,level_id,track_id) values(p_academy,p_year,p_level,p_track) returning id into result; end if;
 return result;
end $$;
create function public.create_scoped_coupon_type(p_academy_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_name text,p_prefix text,p_all_tracks boolean,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.create_content_coupon_type(p_academy_id,edra_private.coupon_scope_program(p_academy_id,p_year_id,p_level_id,p_track_id),p_name,p_request_id,p_prefix,p_all_tracks);
end $$;
create function public.generate_default_coupons(p_academy_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_quantity integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.generate_content_coupons(p_academy_id,edra_private.default_coupon_type(edra_private.coupon_scope_program(p_academy_id,p_year_id,p_level_id,p_track_id)),p_quantity,p_request_id);
end $$;
create function public.change_default_coupon_prefix(p_academy_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_prefix text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.change_content_coupon_prefix(p_academy_id,edra_private.default_coupon_type(edra_private.coupon_scope_program(p_academy_id,p_year_id,p_level_id,p_track_id)),p_prefix,p_request_id);
end $$;

create or replace function public.get_content_coupon_options(p_academy_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
end $$;

do $$ declare definition text; updated text;
begin
 definition:=pg_get_functiondef('public.get_content_coupons(uuid,uuid,uuid,text,text,integer)'::regprocedure);
 updated:=replace(definition,'public.get_content_coupons(p_academy_id uuid, p_program_id uuid DEFAULT NULL::uuid,', 'public.get_scoped_content_coupons(p_academy_id uuid, p_year_id uuid, p_level_id text, p_track_id uuid,');
 updated:=replace(updated,'(p_program_id is null or exists(select 1 from public.content_programs p'||chr(10)||'      where p.id=p_program_id and p.academy_id=p_academy_id and p.academic_year_id=t.academic_year_id'||chr(10)||'        and p.level_id=t.level_id and (t.all_tracks or p.track_id is not distinct from t.track_id)))', '(t.academic_year_id=p_year_id and t.level_id=p_level_id and (t.all_tracks or t.track_id is not distinct from p_track_id))');
 if position('p_program_id' in updated)>0 or position('get_scoped_content_coupons' in updated)=0 then raise exception 'Scope list contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.generate_content_coupons(uuid,uuid,integer,uuid)'::regprocedure);
 updated:=replace(definition,'where id=p_type_id and academy_id=p_academy_id for share','where id=p_type_id and academy_id=p_academy_id and not retired for share');
 if updated=definition then raise exception 'Generation retirement guard changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.change_content_coupon_prefix(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'where academy_id=p_academy_id and id=p_type_id for update','where academy_id=p_academy_id and id=p_type_id and not retired for update');
 if updated=definition then raise exception 'Prefix retirement guard changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_content_requirement_options(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'where t.academy_id=p_academy_id and','where t.academy_id=p_academy_id and not t.retired and');
 if updated=definition then raise exception 'Requirement type list changed'; end if; execute updated;
 definition:=pg_get_functiondef('edra_private.content_requirements(uuid,jsonb)'::regprocedure);
 updated:=replace(definition,'where t.id=(p_document->>''couponTypeId'')::uuid and','where not t.retired and t.id=(p_document->>''couponTypeId'')::uuid and');
 if updated=definition then raise exception 'Requirement type guard changed'; end if; execute updated;
end $$;
revoke all on function edra_private.coupon_scope_program(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.create_scoped_coupon_type(uuid,uuid,text,uuid,text,text,boolean,uuid),public.generate_default_coupons(uuid,uuid,text,uuid,integer,uuid),public.change_default_coupon_prefix(uuid,uuid,text,uuid,text,uuid),public.get_scoped_content_coupons(uuid,uuid,text,uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.create_scoped_coupon_type(uuid,uuid,text,uuid,text,text,boolean,uuid),public.generate_default_coupons(uuid,uuid,text,uuid,integer,uuid),public.change_default_coupon_prefix(uuid,uuid,text,uuid,text,uuid),public.get_scoped_content_coupons(uuid,uuid,text,uuid,uuid,text,text,integer) to authenticated;
commit;
