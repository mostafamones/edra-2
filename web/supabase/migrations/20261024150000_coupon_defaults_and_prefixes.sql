begin;
alter table public.content_coupon_types add column prefix text not null default 'TYPE' check(prefix ~ '^[A-Z]{2,4}$'), add column is_default boolean not null default false;
alter table public.content_coupon_batches add column prefix text not null default 'TYPE' check(prefix ~ '^[A-Z]{2,4}$');
create unique index content_coupon_scope_default on public.content_coupon_types(academy_id,academic_year_id,level_id,coalesce(track_id,'00000000-0000-0000-0000-000000000000'::uuid)) where is_default;

create function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; result uuid; actor uuid;
begin
 select * into strict p from public.content_programs where id=p_program;
 perform pg_advisory_xact_lock(hashtextextended('coupon-default:'||p.academy_id||':'||p.academic_year_id||':'||p.level_id||':'||coalesce(p.track_id::text,''),0));
 select id into result from public.content_coupon_types where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is not distinct from p.track_id and is_default;
 if found then return result; end if;
 select created_by into strict actor from public.academies where id=p.academy_id;
 insert into public.content_coupon_types(academy_id,program_id,academic_year_id,level_id,track_id,name,prefix,is_default,created_by)
 values(p.academy_id,p.id,p.academic_year_id,p.level_id,p.track_id,'Regular','REG',true,coalesce(auth.uid(),actor)) on conflict do nothing;
 update public.content_coupon_types set is_default=true,prefix='REG' where academy_id=p.academy_id and academic_year_id=p.academic_year_id and level_id=p.level_id and track_id is not distinct from p.track_id and lower(btrim(name))='regular' returning id into result;
 if result is null then raise exception 'unavailable'; end if;
 return result;
end $$;
create function edra_private.content_coupon_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='content_programs' then perform edra_private.default_coupon_type(new.id);
 elsif not(new.draft ? 'couponTypeId') then new.draft:=new.draft||jsonb_build_object('couponTypeId',edra_private.default_coupon_type(new.program_id)); end if;
 return new;
end $$;
-- Scope creation is lazy: no empty program identities are added to unused offerings.
create trigger content_program_coupon_default after insert on public.content_programs for each row execute function edra_private.content_coupon_defaults();
create trigger content_unit_coupon_default before insert on public.content_units for each row execute function edra_private.content_coupon_defaults();
do $$ declare p uuid; begin
 for p in select cp.id from public.content_programs cp join public.academic_years y on y.id=cp.academic_year_id where y.closed_at is null loop perform edra_private.default_coupon_type(p); end loop;
end $$;

create function edra_private.coupon_batch_prefix() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select prefix into strict new.prefix from public.content_coupon_types where academy_id=new.academy_id and id=new.type_id for share;
 return new;
end $$;
create trigger coupon_batch_prefix before insert on public.content_coupon_batches for each row execute function edra_private.coupon_batch_prefix();

create function public.change_content_coupon_prefix(p_academy_id uuid,p_type_id uuid,p_prefix text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; retry jsonb; result jsonb; t public.content_coupon_types; normalized text:=upper(btrim(p_prefix));
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 if normalized is null or normalized !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if;
 payload:=jsonb_build_object('type',p_type_id,'prefix',normalized);
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_prefix',payload); if retry is not null then return retry; end if;
 select * into t from public.content_coupon_types where academy_id=p_academy_id and id=p_type_id for update;
 if not found then raise exception 'validation'; end if;
 perform edra_private.coupon_program(p_academy_id,t.program_id);
 update public.content_coupon_types set prefix=normalized where id=t.id;
 result:=jsonb_build_object('prefix',normalized);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_prefix',payload,result);
end $$;

-- Keep existing transaction, session, scope, throttle and retry authority intact.
do $$ declare definition text; updated text;
begin
 definition:=pg_get_functiondef('public.create_content_coupon_type(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'p_request_id uuid)', 'p_request_id uuid, p_prefix text DEFAULT ''TYPE''::text)');
 updated:=replace(updated,'payload:=jsonb_build_object(''program'',p_program_id,''name'',btrim(p_name));', 'if p_prefix is null or upper(btrim(p_prefix)) !~ ''^[A-Z]{2,4}$'' then raise exception ''validation''; end if; payload:=jsonb_build_object(''program'',p_program_id,''name'',btrim(p_name),''prefix'',upper(btrim(p_prefix)));');
 updated:=replace(updated,'track_id,name,created_by)', 'track_id,name,created_by,prefix)');
 updated:=replace(updated,'p.track_id,btrim(p_name),auth.uid())', 'p.track_id,btrim(p_name),auth.uid(),upper(btrim(p_prefix)))');
 if updated=definition or position('p_prefix text DEFAULT' in updated)=0 then raise exception 'Coupon type signature changed'; end if;
 drop function public.create_content_coupon_type(uuid,uuid,text,uuid);
 execute updated;
 definition:=pg_get_functiondef('public.generate_content_coupons(uuid,uuid,integer,uuid)'::regprocedure);
 updated:=replace(definition,'''id'',id,''code'',code)', '''id'',id,''code'',code,''prefix'',t.prefix)');
 if updated=definition then raise exception 'Coupon generation contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_content_coupons(uuid,uuid,uuid,text,text,integer)'::regprocedure);
 updated:=replace(definition,'select c.id,c.code,c.type_id', 'select c.id,c.code,b.prefix,c.type_id');
 if updated=definition then raise exception 'Coupon list contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_content_coupon_options(uuid)'::regprocedure);
 updated:=replace(definition,'''name'',name)', '''name'',name,''prefix'',prefix,''isDefault'',is_default)');
 if updated=definition then raise exception 'Coupon option contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.redeem_content_coupon(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'and code=normalized for update', 'and code=right(normalized,8) for update');
 updated:=replace(updated,'if normalized !~ ''^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$''', 'if normalized !~ ''^([A-Z]{2,4})?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$''');
 updated:=replace(updated,'select * into strict t from public.content_coupon_types where id=c.type_id;', 'if length(normalized)>8 and left(normalized,length(normalized)-8)<>(select prefix from public.content_coupon_batches where id=c.batch_id) then raise exception ''code_unavailable''; end if; select * into strict t from public.content_coupon_types where id=c.type_id;');
 if updated=definition or position('right(normalized,8)' in updated)=0 then raise exception 'Coupon redemption contract changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.copy_content_unit(uuid,uuid,uuid,text,uuid,uuid)'::regprocedure);
 updated:=replace(definition,'(doc-array[''couponTypeId'',''prerequisites''])||jsonb_build_object(''items'',items)', '(doc-array[''couponTypeId'',''prerequisites''])||jsonb_build_object(''items'',items,''couponTypeId'',edra_private.default_coupon_type(target.program_id))');
 if updated=definition then raise exception 'Copy default contract changed'; end if; execute updated;
end $$;
revoke all on function edra_private.default_coupon_type(uuid),edra_private.content_coupon_defaults(),edra_private.coupon_batch_prefix() from public,anon,authenticated;
revoke all on function public.create_content_coupon_type(uuid,uuid,text,uuid,text),public.change_content_coupon_prefix(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.create_content_coupon_type(uuid,uuid,text,uuid,text),public.change_content_coupon_prefix(uuid,uuid,text,uuid) to authenticated;
commit;
