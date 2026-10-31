-- A draft's saves fold into one history entry until someone keeps it as its own version.
begin;
alter table public.content_drafts drop constraint content_drafts_kind_check;
alter table public.content_drafts add constraint content_drafts_kind_check check (kind in ('created','saved','version'));

create function public.save_content_draft_version(p_academy_id uuid,p_unit_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare u public.content_units;
begin
  if p_version is null or p_version<1 then raise exception 'validation'; end if;
  u:=edra_private.content_edit(p_academy_id,p_unit_id,p_version);
  -- A repeated click keeps the one version: this draft hasn't changed since.
  if exists(select 1 from public.content_drafts where unit_id=p_unit_id and version=u.version and kind='version') then return; end if;
  insert into public.content_drafts(unit_id,academy_id,version,kind,document,saved_by)
  values(p_unit_id,p_academy_id,u.version,'version',u.draft,auth.uid());
end $$;
revoke all on function public.save_content_draft_version(uuid,uuid,integer) from public,anon;
grant execute on function public.save_content_draft_version(uuid,uuid,integer) to authenticated;
commit;
