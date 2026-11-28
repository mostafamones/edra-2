-- Concern rename: participating leadership can change an ongoing concern's title. The previous and
-- new titles are kept in a `renamed` event so the change appears in concern history. The existing
-- `concerns_broadcast` trigger already notifies the concern and inbox topics on a title change.

alter table public.concern_events drop constraint concern_events_kind_check;
alter table public.concern_events add constraint concern_events_kind_check check (kind in ('created','participant_added',
  'participant_removed','owner_recovered','settled','reopened','renamed','message_sent','message_edited','message_deleted',
  'reaction_changed','read_updated'));

create function public.rename_concern(p_academy_id uuid, p_concern_id uuid, p_title text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; actor uuid := auth.uid(); next_title text := btrim(p_title);
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id);
  perform edra_private.require_concern_manager(p_academy_id);
  if edra_private.concern_replayed(p_concern_id, p_request_id, array['renamed'], jsonb_build_object('title', next_title)) then
    return edra_private.concern_state(p_concern_id);
  end if;
  if next_title is null or next_title = '' or char_length(next_title) > 120 then perform edra_private.concern_fail('validation'); end if;
  if item.status <> 'ongoing' then raise exception 'concern_settled' using errcode = '55000'; end if;
  if next_title is distinct from item.title then
    update public.concerns set title = next_title, updated_at = clock_timestamp() where id = p_concern_id;
    insert into public.concern_events (academy_id, concern_id, actor_id, kind, detail)
      values (p_academy_id, p_concern_id, actor, 'renamed',
        jsonb_build_object('requestId', p_request_id, 'from', item.title, 'title', next_title));
  end if;
  return edra_private.concern_state(p_concern_id);
end $$;

-- History gains renames; the note is the new title.
create or replace function public.concern_history(p_academy_id uuid, p_concern_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  return coalesce((select jsonb_agg(entry order by at, id) from (
    select e.occurred_at as at, e.id, jsonb_build_object('id', e.id, 'kind', e.kind, 'occurredAt', e.occurred_at,
        'actorId', e.actor_id, 'actorName', (select full_name from public.profiles where id = e.actor_id),
        'subjectId', e.subject_id, 'subjectName', (select full_name from public.profiles where id = e.subject_id),
        'note', coalesce(e.detail->>'outcome', e.detail->>'reason', e.detail->>'title')) as entry
    from public.concern_events e
    where e.academy_id = p_academy_id and e.concern_id = p_concern_id
      and e.kind in ('created', 'participant_added', 'participant_removed', 'owner_recovered', 'settled', 'reopened', 'renamed')
    order by e.occurred_at desc, e.id desc) h), '[]'::jsonb);
end $$;

revoke all on function public.rename_concern(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.rename_concern(uuid, uuid, text, uuid) to authenticated;
