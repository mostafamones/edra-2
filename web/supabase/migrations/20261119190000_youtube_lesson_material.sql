begin;

alter table public.content_assets add column youtube_id text;
alter table public.content_assets add constraint content_assets_youtube_source check (
  youtube_id is null or (youtube_id ~ '^[A-Za-z0-9_-]{11}$' and kind = 'video'
    and provider_upload_id is null and provider_asset_id is null and playback_id is null and storage_path is null)
);

create function public.register_youtube_lesson(p_academy_id uuid,p_unit_id uuid,p_asset_id uuid,p_youtube_id text,p_title text,p_duration numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.learning_actor(p_academy_id);
  perform edra_private.content_edit(p_academy_id,p_unit_id);
  if p_asset_id is null or p_youtube_id is null or p_youtube_id !~ '^[A-Za-z0-9_-]{11}$'
      or coalesce(char_length(btrim(p_title)),0) not between 1 and 250
      or (p_duration is not null and not (p_duration > 0 and p_duration <= 43200)) then raise exception 'validation'; end if;
  insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,youtube_id,duration_seconds)
    values(p_asset_id,p_academy_id,p_unit_id,auth.uid(),'video',btrim(p_title),'video/youtube','ready',p_youtube_id,p_duration)
    on conflict(id) do nothing;
  if not exists(select 1 from public.content_assets where id=p_asset_id and academy_id=p_academy_id
    and unit_id=p_unit_id and created_by=auth.uid() and youtube_id=p_youtube_id and deletion_token is null) then raise exception 'forbidden'; end if;
  return p_asset_id;
end $$;
revoke all on function public.register_youtube_lesson(uuid,uuid,uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.register_youtube_lesson(uuid,uuid,uuid,text,text,numeric) to authenticated;

create or replace function public.authorize_content_material_before_assignments(p_academy_id uuid,p_unit_id uuid,p_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; access jsonb; item jsonb; asset public.content_assets;
begin
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  access:=edra_private.learning_state((scope->>'record')::uuid,p_unit_id);
  if access->>'status'<>'active' then raise exception 'access_required'; end if;
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id'=p_item_id::text;
  if item is null or item->>'kind' not in ('explanation','document') then raise exception 'material_unavailable'; end if;
  select * into asset from public.content_assets where id=(item->>'assetId')::uuid and academy_id=p_academy_id and status='ready' and deletion_token is null for share;
  if not found or (item->>'kind'='document')<>(asset.kind='document') then raise exception 'material_unavailable'; end if;
  return jsonb_build_object('kind',asset.kind,'playbackId',asset.playback_id,'youtubeId',asset.youtube_id,'durationSeconds',asset.duration_seconds,'storagePath',asset.storage_path,'expiresAt',access->'expiresAt');
end $$;

create or replace function edra_private.content_unit_progress(p_unit uuid,p_record uuid,p_document jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item jsonb; result jsonb:='[]'; done boolean; total integer:=0; completed integer:=0;
  progress edra_private.content_video_progress; duration numeric; watched numeric;
begin
  for item in select value from jsonb_array_elements(p_document->'items') loop
    done:=false;
    if item->>'kind'='explanation' then
      total:=total+1;
      select * into progress from edra_private.content_video_progress where annual_record_id=p_record and unit_id=p_unit and asset_id=(item->>'assetId')::uuid;
      select duration_seconds into duration from public.content_assets where id=(item->>'assetId')::uuid;
      watched:=edra_private.content_watched(coalesce(progress.watched,'{}'::nummultirange));
      done:=coalesce(watched>=duration*0.9,false);
      result:=result||jsonb_build_array(jsonb_build_object('itemId',item->>'id','completed',done,
        'opened',progress.asset_id is not null,'watchedSeconds',watched,'durationSeconds',duration,'positionSeconds',coalesce(progress.position_seconds,0)));
    elsif item->>'kind'='assessment' then
      total:=total+1;
      if item->>'assessmentKind'='assignment' then
        done:=exists(select 1 from public.assignment_recipients r where r.assignment_id=(item->>'assessmentId')::uuid
          and r.annual_student_record_id=p_record and r.work_status in ('submitted','late') and r.received_at is not null);
      elsif item->>'assessmentKind'='quiz' then
        done:=exists(select 1 from public.quiz_submissions s where s.quiz_id=(item->>'assessmentId')::uuid and s.annual_student_record_id=p_record);
      elsif item->>'assessmentKind'='exam' then
        done:=exists(select 1 from public.exam_submissions s where s.exam_id=(item->>'assessmentId')::uuid and s.annual_student_record_id=p_record);
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('itemId',item->>'id','completed',done));
    end if;
    if done then completed:=completed+1; end if;
  end loop;
  return jsonb_build_object('items',result,'completed',completed,'total',total);
end $$;

create or replace function public.start_my_content_progress(p_academy_id uuid,p_unit_id uuid,p_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; item jsonb; asset public.content_assets; record_id uuid; session_id uuid:=gen_random_uuid();
  progress edra_private.content_video_progress;
begin
  -- Identical live access and answer qualification checks to playback authorization.
  perform public.authorize_content_material(p_academy_id,p_unit_id,p_item_id);
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id'=p_item_id::text;
  select * into asset from public.content_assets where id=(item->>'assetId')::uuid and academy_id=p_academy_id;
  if asset.kind is distinct from 'video' then raise exception 'material_unavailable'; end if;
  insert into edra_private.content_video_progress(annual_record_id,unit_id,asset_id,resume_session)
    values(record_id,p_unit_id,asset.id,session_id)
    on conflict(annual_record_id,unit_id,asset_id) do update set resume_session=excluded.resume_session
    returning * into progress;
  insert into edra_private.content_progress_sessions(id,annual_record_id,unit_id,asset_id,item_id)
    values(session_id,record_id,p_unit_id,asset.id,p_item_id);
  return jsonb_build_object('sessionId',session_id,'assetId',asset.id,'providerAssetId',asset.provider_asset_id,
    'youtubeId',asset.youtube_id,'durationSeconds',asset.duration_seconds,'positionSeconds',progress.position_seconds);
end $$;

commit;
