-- A saved version is what a schedule publishes; there is no separate confirmation step.
begin;
drop function public.confirm_content_version(uuid,uuid,integer);

create or replace function public.save_content_draft_version(p_academy_id uuid,p_unit_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare u public.content_units;
begin
  perform edra_private.offering_gate();
  if p_version is null or p_version<1 then raise exception 'validation'; end if;
  u:=edra_private.content_edit(p_academy_id,p_unit_id,p_version);
  -- The latest version saved since the last publication is the one a schedule publishes; the worker validates it then.
  insert into public.content_publication_candidates(academy_id,unit_id,unit_version,base_revision,document,confirmed_by)
    values(u.academy_id,u.id,u.version,u.published_revision,u.draft,auth.uid()) on conflict do nothing;
  -- A repeated click keeps the one version: this draft hasn't changed since.
  if exists(select 1 from public.content_drafts where unit_id=p_unit_id and version=u.version and kind='version') then return; end if;
  insert into public.content_drafts(unit_id,academy_id,version,kind,document,saved_by)
  values(p_unit_id,p_academy_id,u.version,'version',u.draft,auth.uid());
end $$;
commit;
