begin;
create function edra_private.content_asset_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; asset public.content_assets;
begin
  for item in select value from jsonb_array_elements(new.draft->'items') where value->>'kind'<>'assessment' loop
    select * into asset from public.content_assets where id=(item->>'assetId')::uuid and academy_id=new.academy_id;
    if not found then raise exception 'invalid_asset'; end if;
    if asset.unit_id<>new.id
      and not exists(select 1 from jsonb_array_elements(old.draft->'items') i where i->>'assetId'=item->>'assetId')
      and not exists(select 1 from public.content_units s join public.content_revisions r on r.unit_id=s.id and r.revision=s.published_revision
        cross join lateral jsonb_array_elements(r.document->'items') i
        where s.academy_id=new.academy_id and s.state='published' and i->>'assetId'=item->>'assetId') then raise exception 'published_source_required'; end if;
  end loop;
  return new;
end $$;
create trigger content_asset_guard before update of draft on public.content_units for each row execute function edra_private.content_asset_guard();
revoke all on function edra_private.content_asset_guard() from public,anon,authenticated;

create function public.copy_content_material(p_academy_id uuid,p_source_id uuid,p_item_id uuid,p_target_id uuid,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare target public.content_units; source public.content_units; doc jsonb; item jsonb; assessment jsonb; fresh uuid; additions jsonb:='[]';
begin
  target:=edra_private.content_edit(p_academy_id,p_target_id,p_version);
  select * into source from public.content_units where id=p_source_id and academy_id=p_academy_id and state='published' for share;
  if not found then raise exception 'published_source_required'; end if;
  select document into strict doc from public.content_revisions where unit_id=source.id and revision=source.published_revision;
  select i into item from jsonb_array_elements(doc->'items') i where (i->>'id')::uuid=p_item_id;
  if item is null then raise exception 'not_found'; end if;
  if item->>'kind' in ('answer','assessment') then
    fresh:=edra_private.content_copy_assessment(item->>'assessmentKind',(item->>'assessmentId')::uuid,target.program_id);
    if item->>'kind'='answer' then
      select i into strict assessment from jsonb_array_elements(doc->'items') i where i->>'kind'='assessment' and i->>'assessmentKind'=item->>'assessmentKind' and i->>'assessmentId'=item->>'assessmentId';
      additions:=jsonb_build_array(assessment||jsonb_build_object('id',gen_random_uuid(),'assessmentId',fresh));
    end if;
    item:=item||jsonb_build_object('assessmentId',fresh);
  end if;
  additions:=additions||jsonb_build_array(item||jsonb_build_object('id',gen_random_uuid()));
  return public.save_content_unit(p_academy_id,p_target_id,p_version,target.draft||jsonb_build_object('items',(target.draft->'items')||additions));
end $$;
revoke all on function public.copy_content_material(uuid,uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.copy_content_material(uuid,uuid,uuid,uuid,integer) to authenticated;
commit;
