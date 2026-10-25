-- Answers may be documents as well as videos. Explanations stay videos and documents stay documents;
-- students open an answer document through the same signed, qualification-gated path as answer videos.
begin;

do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('edra_private.content_document_before_requirements(uuid,jsonb,boolean)'::regprocedure);
  updated:=replace(definition, $r$(item->>'kind'='document')<>(asset.kind='document') then raise exception 'invalid_asset'$r$,
    $r$(item->>'kind'<>'answer' and (item->>'kind'='document')<>(asset.kind='document')) then raise exception 'invalid_asset'$r$);
  if updated=definition then raise exception 'Content material validator changed'; end if;
  execute updated;

  definition:=pg_get_functiondef('public.authorize_content_material(uuid,uuid,uuid)'::regprocedure);
  updated:=replace(replace(definition,
    $r$asset.kind = 'document' or asset.playback_id is null$r$, $r$(asset.kind = 'video' and asset.playback_id is null)$r$),
    $r$'storagePath', null$r$, $r$'storagePath', asset.storage_path$r$);
  if updated=definition or position($r$'storagePath', null$r$ in updated)>0 or position($r$asset.kind = 'document' or$r$ in updated)>0
    then raise exception 'Answer material authorization changed'; end if;
  execute updated;
end $$;

commit;
