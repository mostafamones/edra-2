-- Exact grade/track audiences; preserve printed batches, grants and published selections.
begin;
alter table public.content_programs add column coupon_prefix text;
create unique index content_program_coupon_prefix on public.content_programs(academy_id,academic_year_id,coupon_prefix) where coupon_prefix is not null;
alter table public.content_coupon_types drop constraint content_coupon_types_prefix_check;
alter table public.content_coupon_batches drop constraint content_coupon_batches_prefix_check;
alter table public.content_coupon_types add constraint content_coupon_types_prefix_check check(char_length(prefix) between 2 and 32 and prefix ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$');
alter table public.content_coupon_batches add constraint content_coupon_batches_prefix_check check(char_length(prefix) between 2 and 32 and prefix ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$');

create function edra_private.coupon_audience_prefix(p_academy uuid,p_year uuid,p_level text,p_track uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare base text; candidate text; track_name text; n integer:=1;
begin
 select coupon_prefix into candidate from public.content_programs where academy_id=p_academy and academic_year_id=p_year and level_id=p_level and track_id is not distinct from p_track and coupon_prefix is not null;
 if found then return candidate; end if;
 base:=case when p_level ~ '^secondary-[0-9]+$' then 'S'||split_part(p_level,'-',2)
   when p_level ~ '^preparatory-[0-9]+$' then 'PRE'||split_part(p_level,'-',2)
   when p_level ~ '^primary-[0-9]+$' then 'P'||split_part(p_level,'-',2)
   else left(upper(regexp_replace(p_level,'[^a-zA-Z0-9]','','g')),8) end;
 if coalesce(base,'')='' then base:='GR'; end if;
 if p_track is not null then
  select left(upper(regexp_replace(name,'[^a-zA-Z]','','g')),3) into track_name from public.academy_tracks where id=p_track and academy_id=p_academy and level_id=p_level;
  base:=base||'-'||coalesce(nullif(track_name,''),'TR');
 end if;
 candidate:=base;
 while exists(select 1 from public.content_programs where academy_id=p_academy and academic_year_id=p_year and coupon_prefix=candidate) loop
  n:=n+1; candidate:=base||n;
 end loop;
 return candidate;
end $$;
create function edra_private.coupon_program_prefix(p_program uuid) returns text
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; result text;
begin
 select * into strict p from public.content_programs where id=p_program;
 perform pg_advisory_xact_lock(hashtextextended('coupon-audiences:'||p.academy_id||':'||p.academic_year_id,0));
 select coupon_prefix into result from public.content_programs where id=p.id;
 if result is null then
  result:=edra_private.coupon_audience_prefix(p.academy_id,p.academic_year_id,p.level_id,p.track_id);
  update public.content_programs set coupon_prefix=result where id=p.id;
 end if;
 return result;
end $$;
create function edra_private.coupon_full_prefix(p_program uuid,p_suffix text,p_type uuid) returns text
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; base text; candidate text; n integer:=1;
begin
 if p_suffix is null or upper(btrim(p_suffix)) !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if;
 base:=edra_private.coupon_program_prefix(p_program);
 select * into strict p from public.content_programs where id=p_program;
 candidate:=base||'-'||upper(btrim(p_suffix));
 while exists(select 1 from public.content_coupon_types where academy_id=p.academy_id and academic_year_id=p.academic_year_id and not retired and id<>p_type and replace(prefix,'-','')=replace(candidate,'-','')) loop
  n:=n+1; candidate:=base||'-'||n||'-'||upper(btrim(p_suffix));
 end loop;
 return candidate;
end $$;

-- Existing global types become legacy records. Never rewrite an issued batch.
update public.content_coupon_types set retired=true where level_id is null;
do $$ declare t public.content_coupon_types; p uuid; suffix text;
begin
 for t in select * from public.content_coupon_types where level_id is not null and not retired order by created_at,id loop
  select id into p from public.content_programs where academy_id=t.academy_id and academic_year_id=t.academic_year_id and level_id=t.level_id and track_id is not distinct from t.track_id order by id limit 1;
  if p is null then raise exception 'Coupon audience missing'; end if;
  suffix:=substring(t.prefix from '([A-Z]{2,4})$');
  update public.content_coupon_types set prefix=edra_private.coupon_full_prefix(p,coalesce(suffix,'TYPE'),t.id),program_id=p,all_tracks=(track_id is null) where id=t.id;
 end loop;
end $$;
create unique index content_coupon_printed_prefix on public.content_coupon_types(academy_id,academic_year_id,(replace(prefix,'-',''))) where not retired;

create or replace function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; result uuid; actor uuid; prefix text;
begin
 select * into strict p from public.content_programs where id=p_program;
 prefix:=edra_private.coupon_program_prefix(p.id);
 select id into result from public.content_coupon_types where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is not distinct from p.track_id and is_default and not retired;
 if found then return result; end if;
 select id into result from public.content_coupon_types where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is not distinct from p.track_id and lower(btrim(name))='regular' order by retired,id limit 1;
 if found then
  update public.content_coupon_types set is_default=true,retired=false,all_tracks=(p.track_id is null),prefix=edra_private.coupon_full_prefix(p.id,'REG',result) where id=result;
 else
  result:=gen_random_uuid(); select created_by into strict actor from public.academies where id=p.academy_id;
  insert into public.content_coupon_types(id,academy_id,program_id,academic_year_id,level_id,track_id,name,prefix,is_default,all_tracks,created_by)
   values(result,p.academy_id,p.id,p.academic_year_id,p.level_id,p.track_id,'Regular',edra_private.coupon_full_prefix(p.id,'REG',result),true,p.track_id is null,coalesce(auth.uid(),actor));
 end if;
 return result;
end $$;
do $$ declare p uuid; begin
 for p in select cp.id from public.content_programs cp join public.academic_years y on y.id=cp.academic_year_id where y.closed_at is null order by cp.id loop perform edra_private.default_coupon_type(p); end loop;
end $$;

-- Also reject the older global-creation and cross-track RPC paths at the table boundary.
create function edra_private.coupon_audience_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not new.retired and (new.level_id is null or new.program_id is null or not exists(select 1 from public.content_programs p where p.id=new.program_id and p.academy_id=new.academy_id and p.academic_year_id=new.academic_year_id and p.level_id=new.level_id and p.track_id is not distinct from new.track_id)) then raise exception 'coupon_scope_required'; end if;
 if not new.retired then new.all_tracks:=(new.track_id is null); end if;
 return new;
end $$;
create trigger coupon_audience_guard before insert or update on public.content_coupon_types for each row execute function edra_private.coupon_audience_guard();

create or replace function public.create_content_coupon_type(p_academy_id uuid,p_program_id uuid,p_name text,p_request_id uuid,p_prefix text default 'TYPE',p_all_tracks boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; retry jsonb; result jsonb; p public.content_programs; prefix text;
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 p:=edra_private.coupon_program(p_academy_id,p_program_id);
 if p_all_tracks is null or (p_all_tracks and p.track_id is not null) then raise exception 'coupon_scope_required'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 80 or p_prefix is null or upper(btrim(p_prefix)) !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if;
 payload:=jsonb_build_object('program',p_program_id,'name',btrim(p_name),'prefix',upper(btrim(p_prefix)),'allTracks',p_all_tracks);
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_type',payload); if retry is not null then return retry; end if;
 prefix:=edra_private.coupon_full_prefix(p.id,p_prefix,p_request_id);
 begin
  insert into public.content_coupon_types(id,academy_id,program_id,academic_year_id,level_id,track_id,name,created_by,prefix,all_tracks)
   values(p_request_id,p_academy_id,p.id,p.academic_year_id,p.level_id,p.track_id,btrim(p_name),auth.uid(),prefix,p.track_id is null);
 exception when unique_violation then raise exception 'coupon_type_exists'; end;
 result:=jsonb_build_object('id',p_request_id);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_type',payload,result);
end $$;

create function edra_private.unit_coupon_allowed(p_unit uuid,p_type uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.content_units u join public.content_programs p on p.id=u.program_id join public.content_coupon_types t on t.id=p_type
  where u.id=p_unit and t.academy_id=u.academy_id and t.academic_year_id=p.academic_year_id and
   ((not t.retired and t.level_id=p.level_id and t.track_id is not distinct from p.track_id)
    or u.draft->>'couponTypeId'=t.id::text
    or exists(select 1 from public.content_revisions v where v.unit_id=u.id and v.revision=u.published_revision and v.document->>'couponTypeId'=t.id::text)));
$$;
-- Keep prerequisite, student eligibility, throttle and receipt logic unchanged.
do $$ declare definition text; updated text; start_at integer; end_at integer;
begin
 definition:=pg_get_functiondef('edra_private.content_requirements(uuid,jsonb)'::regprocedure);
 start_at:=position('    perform 1 from public.content_coupon_types' in definition); end_at:=position('    if not found then raise exception ''coupon_type_mismatch''' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Unit coupon contract changed'; end if;
 updated:=left(definition,start_at-1)||'    perform 1 from public.content_coupon_types t where t.id=(p_document->>''couponTypeId'')::uuid and edra_private.unit_coupon_allowed(p_unit,t.id) for share;'||chr(10)||substr(definition,end_at); execute updated;
 definition:=pg_get_functiondef('public.get_content_requirement_options(uuid,uuid)'::regprocedure);
 start_at:=position('  return jsonb_build_object(''types''' in definition); end_at:=position('    ''units''' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Unit type options changed'; end if;
 updated:=left(definition,start_at-1)||'  return jsonb_build_object(''types'',coalesce((select jsonb_agg(jsonb_build_object(''id'',t.id,''name'',t.name||'' · ''||t.prefix||case when t.retired or t.level_id is distinct from p.level_id or t.track_id is distinct from p.track_id then '' (Legacy)'' else '''' end) order by t.is_default desc,t.name,t.id) from public.content_coupon_types t join public.content_programs p on p.id=target.program_id where edra_private.unit_coupon_allowed(target.id,t.id)),''[]''::jsonb),'||chr(10)||substr(definition,end_at); execute updated;
 definition:=pg_get_functiondef('public.redeem_content_coupon(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'^([A-Z]{2,4})?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$','^([A-Z0-9]{2,28})?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$');
 updated:=replace(updated,'<>(select prefix from public.content_coupon_batches where id=c.batch_id)','<>(select replace(prefix,''-'','''') from public.content_coupon_batches where id=c.batch_id)');
 start_at:=position('    if t.academic_year_id<>' in updated); end_at:=position('    -- Serialize both' in updated);
 if start_at=0 or end_at<=start_at or updated=definition then raise exception 'Coupon redemption changed'; end if;
 updated:=left(updated,start_at-1)||'    if t.academic_year_id<>(scope->>''year'')::uuid or (scope->''document''->>''couponTypeId'')::uuid is distinct from t.id then raise exception ''coupon_type_mismatch''; end if;'||chr(10)||substr(updated,end_at); execute updated;
 definition:=pg_get_functiondef('public.get_content_coupon_options(uuid)'::regprocedure);
 updated:=replace(definition,'''track'',track)', '''track'',track,''prefix'',edra_private.coupon_audience_prefix(p_academy_id,year_id,level_id,track_id))');
 updated:=replace(updated,'and not retired)', 'and not retired and level_id is not null)');
 if updated=definition then raise exception 'Coupon catalog changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_scoped_content_coupons(uuid,uuid,text,uuid,uuid,text,text,integer)'::regprocedure);
 -- Both the checked-in baseline and development's earlier global compatibility variant.
 updated:=replace(definition,'(t.level_id is null or t.level_id=p_level_id)', 't.level_id=p_level_id');
 updated:=replace(updated,'(t.all_tracks or t.track_id is not distinct from p_track_id)', 't.track_id is not distinct from p_track_id');
 if updated=definition then raise exception 'Coupon list audience changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.update_scoped_coupon_type(uuid,uuid,uuid,text,uuid,text,text,uuid)'::regprocedure);
 updated:=replace(definition,'begin update public.content_coupon_types set name=new_name,prefix=new_prefix', 'new_prefix:=edra_private.coupon_full_prefix(t.program_id,new_prefix,t.id);'||chr(10)||' begin update public.content_coupon_types set name=new_name,prefix=new_prefix');
 if updated=definition then raise exception 'Atomic type update changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.change_content_coupon_prefix(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'update public.content_coupon_types set prefix=normalized', 'normalized:=edra_private.coupon_full_prefix(t.program_id,normalized,t.id); update public.content_coupon_types set prefix=normalized');
 if updated=definition then raise exception 'Prefix update changed'; end if; execute updated;
end $$;
revoke all on function edra_private.coupon_audience_prefix(uuid,uuid,text,uuid),edra_private.coupon_program_prefix(uuid),edra_private.coupon_full_prefix(uuid,text,uuid),edra_private.coupon_audience_guard(),edra_private.unit_coupon_allowed(uuid,uuid) from public,anon,authenticated;
commit;
