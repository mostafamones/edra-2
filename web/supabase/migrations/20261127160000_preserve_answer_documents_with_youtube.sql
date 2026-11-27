begin;

-- Preserve signed answer documents alongside YouTube and uploaded videos.
create or replace function public.authorize_content_material(p_academy_id uuid, p_unit_id uuid, p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope jsonb; item jsonb; asset public.content_assets;
begin
  scope := edra_private.learning_student(p_academy_id, p_unit_id);
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id' = p_item_id::text;
  if item->>'kind' is distinct from 'answer' then return public.authorize_content_material_before_assignments(p_academy_id, p_unit_id, p_item_id); end if;
  if item->>'assessmentKind' <> 'assignment' or edra_private.assignment_unit((item->>'assessmentId')::uuid) is distinct from p_unit_id
    or not edra_private.assignment_answer_qualified((item->>'assessmentId')::uuid, (scope->>'record')::uuid)
    then raise exception 'material_unavailable'; end if;
  select * into asset from public.content_assets where id = (item->>'assetId')::uuid and academy_id = p_academy_id
    and status = 'ready' and deletion_token is null for share;
  if not found or (asset.kind = 'video' and asset.playback_id is null and asset.youtube_id is null) then raise exception 'material_unavailable'; end if;
  return jsonb_build_object('kind', asset.kind, 'playbackId', asset.playback_id, 'youtubeId', asset.youtube_id, 'storagePath', asset.storage_path,
    'expiresAt', clock_timestamp() + interval '15 minutes');
end $$;

commit;
