begin;
create function public.update_scoped_coupon_type(p_academy_id uuid,p_type_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_name text,p_prefix text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare type_id uuid:=p_type_id; t public.content_coupon_types; payload jsonb; retry jsonb; result jsonb; new_name text:=btrim(p_name); new_prefix text:=upper(btrim(p_prefix));
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id);
 if new_name is null or char_length(new_name) not between 1 and 80 or new_prefix is null or new_prefix !~ '^[A-Z]{2,4}$' then raise exception 'validation'; end if;
 if type_id is null then type_id:=edra_private.default_coupon_type(edra_private.coupon_scope_program(p_academy_id,p_year_id,p_level_id,p_track_id)); end if;
 payload:=jsonb_build_object('type',type_id,'name',new_name,'prefix',new_prefix);
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_type_update',payload); if retry is not null then return retry; end if;
 select * into t from public.content_coupon_types where academy_id=p_academy_id and id=type_id and not retired for update;
 if not found then raise exception 'validation'; end if;
 perform 1 from public.academic_years where academy_id=p_academy_id and id=t.academic_year_id and closed_at is null for share;
 if not found then raise exception 'year_closed'; end if;
 if t.level_id is not null then perform edra_private.require_offering(p_academy_id,t.level_id,t.track_id); end if;
 begin update public.content_coupon_types set name=new_name,prefix=new_prefix where id=t.id;
 exception when unique_violation then raise exception 'coupon_type_exists'; end;
 result:=jsonb_build_object('id',t.id,'name',new_name,'prefix',new_prefix);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_type_update',payload,result);
end $$;

create function public.remove_content_coupon_type(p_academy_id uuid,p_type_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.content_coupon_types; payload jsonb:=jsonb_build_object('type',p_type_id); retry jsonb; result jsonb; used boolean;
begin
 perform edra_private.offering_gate(); perform edra_private.learning_actor(p_academy_id,true);
 retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_type_remove',payload); if retry is not null then return retry; end if;
 select * into t from public.content_coupon_types where academy_id=p_academy_id and id=p_type_id for update;
 if not found then raise exception 'validation'; end if;
 if t.is_default then raise exception 'default_coupon_type'; end if;
 perform 1 from public.academic_years where academy_id=p_academy_id and id=t.academic_year_id and closed_at is null for share;
 if not found then raise exception 'year_closed'; end if;
 if t.level_id is not null then perform edra_private.require_offering(p_academy_id,t.level_id,t.track_id); end if;
 used:=t.retired or exists(select 1 from public.content_coupon_batches where type_id=t.id)
  or exists(select 1 from public.content_units u where u.academy_id=p_academy_id and u.draft->>'couponTypeId'=t.id::text)
  or exists(select 1 from public.content_revisions v where v.academy_id=p_academy_id and v.document->>'couponTypeId'=t.id::text);
 if used then update public.content_coupon_types set retired=true where id=t.id;
 else delete from public.content_coupon_types where id=t.id; end if;
 result:=jsonb_build_object('mode',case when used then 'archived' else 'deleted' end);
 return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_type_remove',payload,result);
end $$;

-- Archived types remain valid only on units that already select them, allowing
-- existing published units and previously issued coupons to keep working.
do $$ declare definition text; updated text;
begin
 definition:=pg_get_functiondef('edra_private.content_requirements(uuid,jsonb)'::regprocedure);
 updated:=replace(definition,'where not t.retired and t.id=',
  'where (not t.retired or u.draft->>''couponTypeId''=t.id::text or exists(select 1 from public.content_revisions keep where keep.unit_id=u.id and keep.revision=u.published_revision and keep.document->>''couponTypeId''=t.id::text)) and t.id=');
 if updated=definition then raise exception 'Retired unit type guard changed'; end if; execute updated;
 definition:=pg_get_functiondef('public.get_content_requirement_options(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'and not t.retired and t.academic_year_id=',
  'and (not t.retired or target.draft->>''couponTypeId''=t.id::text or exists(select 1 from public.content_revisions keep where keep.unit_id=target.id and keep.revision=target.published_revision and keep.document->>''couponTypeId''=t.id::text)) and t.academic_year_id=');
 updated:=replace(updated,'''name'',t.name)', '''name'',t.name||case when t.retired then '' (Archived)'' else '''' end)');
 if updated=definition then raise exception 'Retired requirement options changed'; end if; execute updated;
end $$;
revoke all on function public.update_scoped_coupon_type(uuid,uuid,uuid,text,uuid,text,text,uuid),public.remove_content_coupon_type(uuid,uuid,uuid) from public,anon;
grant execute on function public.update_scoped_coupon_type(uuid,uuid,uuid,text,uuid,text,text,uuid),public.remove_content_coupon_type(uuid,uuid,uuid) to authenticated;
commit;
