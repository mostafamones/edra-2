begin;
-- Public RPCs can be called without the web validator. Keep every saved document
-- readable by the typed editor, including creation and provider-independent edits.
create function edra_private.content_shape()
returns trigger language plpgsql set search_path='' as $$
declare item jsonb; doc jsonb:=new.draft;
begin
  if jsonb_typeof(doc) is distinct from 'object'
    or jsonb_typeof(doc->'title') is distinct from 'string'
    or char_length(btrim(doc->>'title')) not between 1 and 200
    or jsonb_typeof(doc->'description') is distinct from 'string'
    or char_length(doc->>'description')>10000
    or jsonb_typeof(doc->'items') is distinct from 'array'
    or doc-array['title','description','items']<>'{}'::jsonb then raise exception 'validation'; end if;
  if jsonb_array_length(doc->'items')>200 then raise exception 'validation'; end if;
  for item in select value from jsonb_array_elements(doc->'items') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'kind') is distinct from 'string'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or char_length(btrim(item->>'title')) not between 1 and 250
      or item-array['id','kind','title','assetId','assessmentKind','assessmentId']<>'{}'::jsonb
      or (item ? 'assetId' and jsonb_typeof(item->'assetId') is distinct from 'string')
      or (item ? 'assessmentId' and jsonb_typeof(item->'assessmentId') is distinct from 'string')
      or (item ? 'assessmentKind' and (jsonb_typeof(item->'assessmentKind') is distinct from 'string' or item->>'assessmentKind' not in ('assignment','quiz','exam')))
      then raise exception 'validation'; end if;
  end loop;
  return new;
end $$;
create trigger content_document_shape before insert or update of draft on public.content_units for each row execute function edra_private.content_shape();
revoke all on function edra_private.content_shape() from public,anon,authenticated;
commit;
