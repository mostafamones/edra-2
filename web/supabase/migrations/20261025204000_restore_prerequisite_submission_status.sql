-- The unlock prerequisite rollout accidentally restored the obsolete "received" enum value.
-- Patch only that comparison in the current definitions, preserving other concurrent edits.
begin;
do $$ declare signature text; definition text; corrected text;
begin
 foreach signature in array array[
  'edra_private.content_requirements_met(uuid,uuid)',
  'public.get_my_content_unit(uuid,uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  corrected:=replace(definition,'r.work_status=''received''','r.work_status in (''submitted'',''late'')');
  if corrected=definition then
   if position('r.work_status in (''submitted'',''late'')' in definition)=0 then
    raise exception 'Prerequisite submission contract changed: %',signature;
   end if;
  else execute corrected;
  end if;
 end loop;
end $$;
commit;
