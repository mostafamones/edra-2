-- Save the submitted working document and publish it as one transaction.
-- Failed publication must leave both the stored draft and live revision intact.
begin;
create function public.publish_content_edits(p_academy_id uuid,p_unit_id uuid,p_version integer,p_document jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare saved_version integer;
begin
  perform edra_private.content_actor(p_academy_id,true);
  saved_version:=public.save_content_unit(p_academy_id,p_unit_id,p_version,p_document);
  return public.change_content_unit(p_academy_id,p_unit_id,saved_version,'publish');
end $$;
revoke all on function public.publish_content_edits(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.publish_content_edits(uuid,uuid,integer,jsonb) to authenticated;
commit;
