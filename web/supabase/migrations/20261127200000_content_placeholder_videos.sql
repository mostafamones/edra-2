-- Placeholder videos: a ready video entity with no provider media. A later upload replaces the same
-- content_assets row (same id, so units, revisions and student progress keep pointing at it) by setting the
-- provider columns and clearing `placeholder` in one update; the shape check refuses either half alone.
begin;

alter table public.content_assets add column placeholder boolean not null default false;
alter table public.content_assets add constraint content_assets_placeholder_shape check (
  not placeholder or (kind = 'video' and status = 'ready' and provider_upload_id is null
    and provider_asset_id is null and playback_id is null and duration_seconds is not null));

-- Staff register a placeholder the way they register an upload; the duration drives progress and completion.
create function public.register_placeholder_video(p_academy_id uuid, p_unit_id uuid, p_id uuid, p_name text, p_duration_seconds numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.content_edit(p_academy_id, p_unit_id);
  if p_id is null or char_length(btrim(coalesce(p_name, ''))) not between 1 and 250
    or p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 43200 then raise exception 'validation'; end if;
  insert into public.content_assets(id, academy_id, unit_id, created_by, kind, name, mime_type, status, duration_seconds, placeholder)
    values (p_id, p_academy_id, p_unit_id, auth.uid(), 'video', btrim(p_name), 'video/placeholder', 'ready', p_duration_seconds, true)
    on conflict (id) do nothing;
  if not exists (select 1 from public.content_assets where id = p_id and academy_id = p_academy_id and unit_id = p_unit_id
      and created_by = auth.uid() and kind = 'video') then raise exception 'forbidden'; end if;
  return p_id;
end $$;

revoke all on function public.register_placeholder_video(uuid, uuid, uuid, text, numeric) from public, anon;
grant execute on function public.register_placeholder_video(uuid, uuid, uuid, text, numeric) to authenticated;

commit;
