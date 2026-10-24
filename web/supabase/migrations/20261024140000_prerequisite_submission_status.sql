-- Assignment receipt is represented by submitted/late, not by a received enum.
begin;
do $$
declare signature text; definition text; corrected text;
begin
  foreach signature in array array[
    'edra_private.content_requirements_met(uuid,uuid)',
    'public.get_my_content_unit(uuid,uuid)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    corrected:=replace(definition,'r.work_status=''received''','r.work_status in (''submitted'',''late'')');
    if corrected=definition then raise exception 'Prerequisite submission contract changed: %',signature; end if;
    execute corrected;
  end loop;
end $$;
commit;
