-- Documents can be attached to an explanation video as its supporting material. An attached document is a
-- `document` item with `"attached": true`, stored directly after its video (or after earlier attached documents).
-- Position rather than an item id identifies the video, so whole-unit copies, which issue new item ids, keep it.
begin;

do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('edra_private.content_shape()'::regprocedure);
  updated:=replace(definition, $r$item-array['id','kind','title','assetId','assessmentKind','assessmentId']<>'{}'::jsonb$r$,
    $r$item-array['id','kind','title','assetId','assessmentKind','assessmentId','attached']<>'{}'::jsonb
      or (item ? 'attached' and item->'attached' is distinct from 'true'::jsonb)$r$);
  if updated=definition then raise exception 'Content shape validator changed'; end if;
  execute updated;

  -- Copying one material into another unit drops the attachment; its video is not copied with it.
  definition:=pg_get_functiondef('public.copy_content_material(uuid,uuid,uuid,uuid,integer)'::regprocedure);
  updated:=replace(definition, $r$additions:=additions||jsonb_build_array(item||jsonb_build_object('id',gen_random_uuid()));$r$,
    $r$additions:=additions||jsonb_build_array((item-'attached')||jsonb_build_object('id',gen_random_uuid()));$r$);
  if updated=definition then raise exception 'Content material copy changed'; end if;
  execute updated;
end $$;

create function edra_private.content_attachments(p_document jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare item jsonb; parent text;
begin
  for item in select value from jsonb_array_elements(coalesce(p_document->'items','[]'::jsonb)) loop
    if item ? 'attached' then
      if item->>'kind' is distinct from 'document' or parent is distinct from 'explanation' then raise exception 'invalid_attachment'; end if;
    else parent:=item->>'kind';
    end if;
  end loop;
end $$;

alter function edra_private.content_document(uuid,jsonb,boolean) rename to content_document_before_attachments;
create function edra_private.content_document(p_unit uuid,p_document jsonb,p_publish boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform edra_private.content_attachments(p_document);
  perform edra_private.content_document_before_attachments(p_unit,p_document,p_publish);
end $$;

revoke all on function edra_private.content_attachments(jsonb), edra_private.content_document(uuid,jsonb,boolean),
  edra_private.content_document_before_attachments(uuid,jsonb,boolean) from public,anon,authenticated;
commit;
