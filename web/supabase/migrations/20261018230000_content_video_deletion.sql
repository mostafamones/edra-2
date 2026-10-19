begin;
-- A durable reservation prevents new references while Mux deletion is in flight.
-- Failed provider calls keep this marker, so an explicit retry can finish safely.
alter table public.content_assets add column deletion_token uuid;

create function edra_private.content_asset_unused(p_academy uuid,p_asset uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.content_units u where u.academy_id=p_academy
      and u.draft->'items' @> jsonb_build_array(jsonb_build_object('assetId',p_asset)))
    or exists(select 1 from public.content_revisions r where r.academy_id=p_academy
      and r.document->'items' @> jsonb_build_array(jsonb_build_object('assetId',p_asset))) then
    raise exception 'asset_in_use';
  end if;
end $$;

create function edra_private.content_asset_deletion_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare asset record; doc jsonb;
begin
  doc:=case when TG_TABLE_NAME='content_units' then to_jsonb(new)->'draft' else to_jsonb(new)->'document' end;
  for asset in select a.id,a.deletion_token from public.content_assets a
    where a.id in(select (i->>'assetId')::uuid from jsonb_array_elements(doc->'items') i where i ? 'assetId')
    order by a.id for share loop
    if asset.deletion_token is not null then raise exception 'asset_deleting'; end if;
  end loop;
  return new;
end $$;
create trigger content_asset_deletion_guard before insert or update of draft on public.content_units
  for each row execute function edra_private.content_asset_deletion_guard();
create trigger content_revision_asset_deletion_guard before insert on public.content_revisions
  for each row execute function edra_private.content_asset_deletion_guard();

create function public.request_content_video_deletion(p_academy_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare asset public.content_assets;
begin
  perform edra_private.content_actor(p_academy_id);
  select * into asset from public.content_assets where id=p_asset_id and academy_id=p_academy_id;
  if not found or asset.kind<>'video' then raise exception 'not_found'; end if;
  perform edra_private.content_edit(p_academy_id,asset.unit_id);
  select * into strict asset from public.content_assets where id=p_asset_id and academy_id=p_academy_id for update;
  perform edra_private.content_asset_unused(p_academy_id,p_asset_id);
  if asset.deletion_token is null then
    update public.content_assets set deletion_token=gen_random_uuid() where id=p_asset_id returning * into asset;
  end if;
  return asset.deletion_token;
end $$;

-- Called only by the trusted server after the provider confirms deletion/cancellation.
create function public.complete_content_video_deletion(p_academy_id uuid,p_asset_id uuid,p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
declare asset public.content_assets;
begin
  select * into asset from public.content_assets where id=p_asset_id and academy_id=p_academy_id for update;
  if not found then return; end if;
  if asset.kind<>'video' or p_token is null or asset.deletion_token is distinct from p_token then raise exception 'forbidden'; end if;
  perform edra_private.content_asset_unused(p_academy_id,p_asset_id);
  delete from public.content_assets where id=p_asset_id;
end $$;

revoke all on function edra_private.content_asset_unused(uuid,uuid),edra_private.content_asset_deletion_guard() from public,anon,authenticated;
revoke all on function public.request_content_video_deletion(uuid,uuid) from public,anon;
grant execute on function public.request_content_video_deletion(uuid,uuid) to authenticated;
revoke all on function public.complete_content_video_deletion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_content_video_deletion(uuid,uuid,uuid) to service_role;
commit;
