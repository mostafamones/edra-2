begin;
-- All prefix writers take the same academy/year lock before locking a type row.
-- This matches lazy default creation and avoids a lock-order cycle during edits.
do $$ declare signature text; definition text; updated text;
begin
 foreach signature in array array['public.update_scoped_coupon_type(uuid,uuid,uuid,text,uuid,text,text,uuid)','public.change_content_coupon_prefix(uuid,uuid,text,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,' select * into t from public.content_coupon_types where academy_id=p_academy_id and id=',
   ' perform pg_advisory_xact_lock(hashtextextended(''coupon-audiences:''||p_academy_id||'':''||(select academic_year_id from public.content_coupon_types where academy_id=p_academy_id and id=p_type_id),0));'||chr(10)||' select * into t from public.content_coupon_types where academy_id=p_academy_id and id=');
  -- Atomic updates can resolve a virtual default to their local type_id.
  if signature like 'public.update_scoped%' then updated:=replace(updated,'and id=p_type_id),0))','and id=type_id),0))'); end if;
  if updated=definition then raise exception 'Coupon prefix lock contract changed'; end if; execute updated;
 end loop;
end $$;
create or replace function edra_private.coupon_audience_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.academy_id,new.academic_year_id,new.level_id,new.track_id,new.program_id) is distinct from (old.academy_id,old.academic_year_id,old.level_id,old.track_id,old.program_id) then raise exception 'coupon_scope_required'; end if;
 if not new.retired and (new.level_id is null or new.program_id is null or not exists(select 1 from public.content_programs p where p.id=new.program_id and p.academy_id=new.academy_id and p.academic_year_id=new.academic_year_id and p.level_id=new.level_id and p.track_id is not distinct from new.track_id)) then raise exception 'coupon_scope_required'; end if;
 if not new.retired then new.all_tracks:=(new.track_id is null); end if;
 return new;
end $$;
commit;
