-- Concern attachments and voice notes (EDRA-294).
--
-- Bytes live in the private `concern-media` bucket. Browsers have no Storage policies: the server
-- reserves an attachment under the concern lock, issues a one-time signed upload URL for a fresh
-- object, reads the uploaded bytes back to verify size, type and (for voice) container duration,
-- and attests them with the service role. Only the uploader's own verified, unbound attachments
-- can be bound to a message, inside the same concern lock as the send, so racing sends cannot
-- share or exceed them. Retrieval goes through an authenticated same-origin route that rechecks
-- current academy/concern access and that the message is not deleted on every request.
--
-- States: pending (reserved, bytes unverified) -> ready (verified, unbound) -> bound (in a message)
-- and any of them -> removed (discarded, rejected, expired or the message was deleted). Removal is
-- final. Removed objects are physically deleted by the Worker's scheduled maintenance in small
-- leased batches, only after every upload URL issued for them has expired, so a still-valid URL
-- cannot recreate an object after its purge.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('concern-media', 'concern-media', false, 26214400, null)
  on conflict (id) do nothing;
-- No client Storage policies: uploads use server-issued signed upload URLs; reads use the server route.

create table public.concern_attachments (
  id uuid primary key,
  academy_id uuid not null,
  concern_id uuid not null,
  uploader_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('file', 'voice')),
  name text not null check (char_length(name) between 1 and 255 and name !~ '[[:cntrl:]/\\]' and btrim(name) = name),
  bytes bigint not null check (bytes between 1 and 26214400),
  content_type text check (content_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  duration_seconds numeric(6, 2) check (duration_seconds > 0 and duration_seconds <= 300),
  state text not null default 'pending' check (state in ('pending', 'ready', 'bound', 'removed')),
  message_id uuid,
  position smallint check (position between 0 and 9),
  created_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  removed_at timestamptz,
  -- Latest moment an issued signed upload URL could still create the object (2 h provider lifetime + margin).
  upload_expires_at timestamptz,
  purge_claimed_at timestamptz,
  purged_at timestamptz,
  storage_path text generated always as (academy_id::text || '/' || concern_id::text || '/' || id::text) stored,
  foreign key (academy_id, concern_id) references public.concerns(academy_id, id),
  foreign key (concern_id, message_id) references public.concern_messages(concern_id, id),
  unique (message_id, position),
  check ((state = 'removed') = (removed_at is not null)),
  check (state <> 'bound' or (message_id is not null and position is not null)),
  check (state not in ('pending', 'ready') or (message_id is null and position is null)),
  check (state not in ('ready', 'bound') or (content_type is not null and verified_at is not null)),
  check (kind = 'voice' or duration_seconds is null),
  check (kind = 'file' or state not in ('ready', 'bound') or duration_seconds is not null),
  check (purged_at is null or state = 'removed')
);
create index concern_attachments_open_idx on public.concern_attachments(concern_id, uploader_id) where state in ('pending', 'ready');
create index concern_attachments_message_idx on public.concern_attachments(message_id, position) where message_id is not null;
create index concern_attachments_expiry_idx on public.concern_attachments(created_at) where state in ('pending', 'ready');
create index concern_attachments_purge_idx on public.concern_attachments(removed_at) where state = 'removed' and purged_at is null;

alter table public.concern_attachments enable row level security;
revoke all on public.concern_attachments from public, anon, authenticated;
grant all on public.concern_attachments to service_role;
-- No browser policies: descriptors reach clients only through the message read functions.

-- ---------------------------------------------------------------------------------------------
-- Message shapes. A live message may now have no text (media only); deletion is `deleted_at`.

-- `{count, voice}` for a live message's bound media, or null. Never describes deleted messages.
create function edra_private.concern_media_summary(p_message_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when count(*) > 0 then jsonb_build_object('count', count(*), 'voice', bool_or(a.kind = 'voice')) end
  from public.concern_attachments a join public.concern_messages m on m.id = a.message_id
  where a.message_id = p_message_id and a.state = 'bound' and m.deleted_at is null;
$$;

create or replace function edra_private.concern_message_json(m public.concern_messages)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'concernId', m.concern_id, 'seq', m.seq, 'revision', m.revision,
    'authorId', m.author_id, 'authorName', (select full_name from public.profiles where id = m.author_id),
    'body', m.body, 'mentions', to_jsonb(m.mentions),
    'createdAt', m.created_at, 'editedAt', m.edited_at, 'deletedAt', m.deleted_at,
    'replyTo', (select jsonb_build_object('id', r.id, 'seq', r.seq, 'authorId', r.author_id,
        'authorName', (select full_name from public.profiles where id = r.author_id),
        'body', r.body, 'deleted', r.deleted_at is not null, 'media', edra_private.concern_media_summary(r.id))
      from public.concern_messages r where r.concern_id = m.concern_id and r.id = m.reply_to_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'userIds', x.users) order by x.first, x.emoji)
      from (select emoji, jsonb_agg(user_id order by created_at, user_id) users, min(created_at) first
            from public.concern_reactions where message_id = m.id group by emoji) x), '[]'::jsonb),
    'attachments', case when m.deleted_at is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'contentType', a.content_type, 'bytes', a.bytes,
          'kind', a.kind, 'durationSeconds', a.duration_seconds) order by a.position)
      from public.concern_attachments a where a.message_id = m.id and a.state = 'bound'), '[]'::jsonb) end);
$$;

-- Appends one message to a concern the caller has already locked and may write. Text, media or
-- both; attachments must be the caller's own verified, unbound uploads in this concern.
create function edra_private.post_concern_message(item public.concerns, p_message_id uuid, p_body text,
  p_reply_to_id uuid, p_mentions uuid[], p_attachment_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare msg public.concern_messages; clean uuid[]; next_seq bigint; media uuid[] := coalesce(p_attachment_ids, '{}');
  bound integer;
begin
  if p_message_id is null then perform edra_private.concern_fail('validation'); end if;
  if cardinality(media) > 10 then perform edra_private.concern_fail('attachment_limit'); end if;
  if exists (select 1 from unnest(media) x where x is null)
    or cardinality(media) <> (select count(distinct x) from unnest(media) x) then
    perform edra_private.concern_fail('validation');
  end if;
  if p_body is not null or cardinality(media) = 0 then perform edra_private.check_concern_body(p_body); end if;
  if p_reply_to_id is not null and not exists (select 1 from public.concern_messages
      where concern_id = item.id and id = p_reply_to_id and deleted_at is null) then
    perform edra_private.concern_fail('reply_unavailable');
  end if;
  clean := edra_private.concern_mentions(item.id, p_mentions);
  -- Lock the attachments in id order: racing sends (same concern lock) and expiry (skip locked) cannot share them.
  perform 1 from public.concern_attachments where id = any(media) order by id for update;
  select count(*) into bound from public.concern_attachments
    where id = any(media) and concern_id = item.id and academy_id = item.academy_id
      and uploader_id = auth.uid() and state = 'ready';
  if bound <> cardinality(media) then perform edra_private.concern_fail('attachment_unavailable'); end if;
  select coalesce(max(seq), 0) + 1 into next_seq from public.concern_messages where concern_id = item.id;
  insert into public.concern_messages (id, academy_id, concern_id, seq, revision, author_id, body, reply_to_id, mentions)
    values (p_message_id, item.academy_id, item.id, next_seq, nextval('public.concern_revision_seq'),
      auth.uid(), p_body, p_reply_to_id, clean)
    returning * into msg;
  update public.concern_attachments a set state = 'bound', message_id = msg.id, position = o.ordinality - 1
    from unnest(media) with ordinality o(id, ordinality) where a.id = o.id;
  update public.concerns set updated_at = msg.created_at where id = item.id;
  -- The author has seen their own message.
  update public.concern_participants set last_read_seq = next_seq, read_at = msg.created_at
    where concern_id = item.id and user_id = auth.uid();
  -- Ids and kinds only: notification previews read the current message and its live media.
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (item.academy_id, item.id, auth.uid(), 'message_sent', msg.id,
      jsonb_build_object('seq', msg.seq, 'mentions', to_jsonb(clean), 'attachments', to_jsonb(media),
        'voice', exists (select 1 from public.concern_attachments where message_id = msg.id and kind = 'voice')));
  return edra_private.concern_message_json(msg);
end $$;

-- The text-only form (creation's opening message) keeps its required text.
create or replace function edra_private.post_concern_message(item public.concerns, p_message_id uuid, p_body text,
  p_reply_to_id uuid, p_mentions uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.check_concern_body(p_body);
  return edra_private.post_concern_message(item, p_message_id, p_body, p_reply_to_id, p_mentions, '{}'::uuid[]);
end $$;

revoke all on function edra_private.concern_media_summary(uuid),
  edra_private.post_concern_message(public.concerns, uuid, text, uuid, uuid[], uuid[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Messaging commands gain media.

drop function public.send_concern_message(uuid, uuid, uuid, text, uuid, uuid[]);
create function public.send_concern_message(p_academy_id uuid, p_concern_id uuid, p_message_id uuid,
  p_body text, p_reply_to_id uuid default null, p_mentions uuid[] default '{}', p_attachment_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; msg public.concern_messages;
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id);
  select * into msg from public.concern_messages where id = p_message_id;
  if found then
    -- A retry returns the original, even if it was since deleted or the concern settled.
    if msg.concern_id <> p_concern_id or msg.author_id <> auth.uid() then perform edra_private.concern_fail('conflict'); end if;
    return edra_private.concern_message_json(msg);
  end if;
  if item.status <> 'ongoing' then raise exception 'concern_settled' using errcode = '55000'; end if;
  return edra_private.post_concern_message(item, p_message_id, p_body, p_reply_to_id, p_mentions, p_attachment_ids);
end $$;

-- Text edits keep the bound media. A media message may have its text cleared, a text-only one may not.
create or replace function public.edit_concern_message(p_academy_id uuid, p_concern_id uuid, p_message_id uuid,
  p_body text, p_mentions uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; msg public.concern_messages; clean uuid[];
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id, true);
  select * into msg from public.concern_messages where concern_id = p_concern_id and id = p_message_id;
  if not found then perform edra_private.concern_fail('message_not_found'); end if;
  if msg.author_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if msg.deleted_at is not null then perform edra_private.concern_fail('message_deleted'); end if;
  if p_body is not null or not exists (select 1 from public.concern_attachments where message_id = msg.id and state = 'bound') then
    perform edra_private.check_concern_body(p_body);
  end if;
  clean := edra_private.concern_mentions(p_concern_id, p_mentions);
  -- An identical retry succeeds even after the window closes.
  if msg.body is not distinct from p_body and msg.mentions = clean then return edra_private.concern_message_json(msg); end if;
  if clock_timestamp() > msg.created_at + interval '300 seconds' then perform edra_private.concern_fail('edit_expired'); end if;
  update public.concern_messages set body = p_body, mentions = clean, edited_at = clock_timestamp(),
    revision = nextval('public.concern_revision_seq')
    where id = msg.id returning * into msg;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (item.academy_id, item.id, auth.uid(), 'message_edited', msg.id,
      jsonb_build_object('seq', msg.seq, 'mentions', to_jsonb(clean)));
  return edra_private.concern_message_json(msg);
end $$;

-- Deletion also revokes the message's media at once; bytes are purged later.
create or replace function public.delete_concern_message(p_academy_id uuid, p_concern_id uuid, p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; msg public.concern_messages;
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id, true);
  select * into msg from public.concern_messages where concern_id = p_concern_id and id = p_message_id;
  if not found then perform edra_private.concern_fail('message_not_found'); end if;
  if msg.author_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if msg.deleted_at is not null then return edra_private.concern_message_json(msg); end if;
  delete from public.concern_reactions where message_id = msg.id;
  update public.concern_attachments set state = 'removed', removed_at = clock_timestamp()
    where message_id = msg.id and state = 'bound';
  update public.concern_messages set body = null, mentions = '{}', edited_at = null, deleted_at = clock_timestamp(),
    revision = nextval('public.concern_revision_seq')
    where id = msg.id returning * into msg;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (item.academy_id, item.id, auth.uid(), 'message_deleted', msg.id, jsonb_build_object('seq', msg.seq));
  return edra_private.concern_message_json(msg);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Upload lifecycle.

create function edra_private.concern_attachment_json(a public.concern_attachments)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'contentType', a.content_type, 'bytes', a.bytes,
    'kind', a.kind, 'durationSeconds', a.duration_seconds, 'state', a.state, 'path', a.storage_path);
$$;
revoke all on function edra_private.concern_attachment_json(public.concern_attachments) from public, anon, authenticated;

-- Reserves one upload for the caller in an ongoing concern they can write. Retrying the same id
-- with the same details returns the reservation. At most 20 open (unsent) uploads per person per concern.
-- Each pending result may be followed by a signed upload URL (valid 2 hours by default), so the
-- reservation records when the last such URL expires; purge waits for it.
create function public.reserve_concern_attachment(p_academy_id uuid, p_concern_id uuid, p_attachment_id uuid,
  p_kind text, p_name text, p_bytes bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; a public.concern_attachments;
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id, true);
  if p_attachment_id is null then perform edra_private.concern_fail('validation'); end if;
  -- Concern, then attachment: a retry never extends or re-signs an upload expiry just removed.
  select * into a from public.concern_attachments where id = p_attachment_id for update;
  if found then
    if a.concern_id <> p_concern_id or a.uploader_id <> auth.uid() or a.kind is distinct from p_kind
      or a.name is distinct from p_name or a.bytes is distinct from p_bytes then
      perform edra_private.concern_fail('conflict');
    end if;
    if a.state not in ('pending', 'ready') then perform edra_private.concern_fail('attachment_unavailable'); end if;
    if a.state = 'pending' then
      update public.concern_attachments set upload_expires_at = clock_timestamp() + interval '3 hours'
        where id = a.id returning * into a;
    end if;
    return edra_private.concern_attachment_json(a);
  end if;
  if p_kind is null or p_kind not in ('file', 'voice') or p_name is null or char_length(p_name) not between 1 and 255
    or p_name ~ '[[:cntrl:]/\\]' or btrim(p_name) <> p_name or p_bytes is null or p_bytes < 1 then
    perform edra_private.concern_fail('validation');
  end if;
  if p_bytes > 26214400 then perform edra_private.concern_fail('attachment_too_large'); end if;
  if (select count(*) from public.concern_attachments where concern_id = p_concern_id and uploader_id = auth.uid()
      and state in ('pending', 'ready')) >= 20 then
    perform edra_private.concern_fail('attachment_limit');
  end if;
  insert into public.concern_attachments (id, academy_id, concern_id, uploader_id, kind, name, bytes, upload_expires_at)
    values (p_attachment_id, p_academy_id, p_concern_id, auth.uid(), p_kind, p_name, p_bytes, clock_timestamp() + interval '3 hours')
    returning * into a;
  return edra_private.concern_attachment_json(a);
end $$;

-- The caller's own open upload, for the server to verify its bytes. Requires current write access.
create function public.concern_attachment_upload(p_academy_id uuid, p_concern_id uuid, p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.concern_attachments;
begin
  perform edra_private.require_concern(p_academy_id, p_concern_id, true);
  select * into a from public.concern_attachments where id = p_attachment_id and concern_id = p_concern_id
    and uploader_id = auth.uid() and state in ('pending', 'ready');
  if not found then perform edra_private.concern_fail('attachment_unavailable'); end if;
  return edra_private.concern_attachment_json(a);
end $$;

-- Cancels the caller's own unsent upload. Allowed when settled so abandoned uploads can be cleaned.
create function public.discard_concern_attachment(p_academy_id uuid, p_concern_id uuid, p_attachment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_concern(p_academy_id, p_concern_id);
  update public.concern_attachments set state = 'removed', removed_at = clock_timestamp()
    where id = p_attachment_id and concern_id = p_concern_id and uploader_id = auth.uid() and state in ('pending', 'ready');
end $$;

-- The uploader's live authority without a browser session: the same participant, membership and
-- captured-identity rule as concern_has_access.
create function edra_private.concern_user_active(p_academy_id uuid, p_concern_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.concern_participants p
    join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
    where p.academy_id = p_academy_id and p.concern_id = p_concern_id and p.user_id = p_user_id
      and p.removed_at is null and m.suspended_at is null and m.created_at = p.membership_created_at);
$$;
revoke all on function edra_private.concern_user_active(uuid, uuid, uuid) from public, anon, authenticated;

-- Service role only, after the server has read the stored bytes: accepts them with their detected
-- type and container duration, or rejects (removes) them. Takes the concern lock first, like sends,
-- discards, deletion and lifecycle commands, then the attachment. Acceptance requires an ongoing
-- concern and the uploader's current participation; removed uploads are never resurrected.
-- Accepting an already accepted upload returns it unchanged.
create function public.verify_concern_attachment(p_attachment_id uuid, p_accept boolean, p_content_type text,
  p_duration_seconds numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.concern_attachments; item public.concerns;
begin
  select * into a from public.concern_attachments where id = p_attachment_id;
  if not found then perform edra_private.concern_fail('attachment_unavailable'); end if;
  select * into item from public.concerns where academy_id = a.academy_id and id = a.concern_id for update;
  select * into a from public.concern_attachments where id = p_attachment_id for update;
  if a.state = 'ready' and coalesce(p_accept, false) then return edra_private.concern_attachment_json(a); end if;
  if a.state <> 'pending' then perform edra_private.concern_fail('attachment_unavailable'); end if;
  if not coalesce(p_accept, false) then
    update public.concern_attachments set state = 'removed', removed_at = clock_timestamp() where id = a.id returning * into a;
    return edra_private.concern_attachment_json(a);
  end if;
  if item.status <> 'ongoing' then raise exception 'concern_settled' using errcode = '55000'; end if;
  if not edra_private.concern_user_active(a.academy_id, a.concern_id, a.uploader_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_content_type is null or p_content_type !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
    or (a.kind = 'file' and p_duration_seconds is not null)
    or (a.kind = 'voice' and (p_content_type not in ('audio/webm', 'audio/ogg')
      or p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 300)) then
    perform edra_private.concern_fail('validation');
  end if;
  update public.concern_attachments set state = 'ready', content_type = p_content_type,
    duration_seconds = p_duration_seconds, verified_at = clock_timestamp()
    where id = a.id returning * into a;
  return edra_private.concern_attachment_json(a);
end $$;

-- Retrieval: current participation in the academy's concern AND a live (not deleted) message.
create function public.concern_attachment_access(p_academy_id uuid, p_concern_id uuid, p_attachment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.concern_attachments;
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  select x.* into a from public.concern_attachments x
    join public.concern_messages m on m.concern_id = x.concern_id and m.id = x.message_id
    where x.id = p_attachment_id and x.academy_id = p_academy_id and x.concern_id = p_concern_id
      and x.state = 'bound' and m.deleted_at is null;
  if not found then perform edra_private.concern_fail('attachment_unavailable'); end if;
  return edra_private.concern_attachment_json(a);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cleanup. Supabase Cron revokes stale unsent uploads; the Worker's Cron Trigger deletes removed
-- objects through the Storage API in small leased batches (SQL cannot delete Storage objects and
-- this project has no pg_net), once no issued upload URL can recreate them.

create function edra_private.expire_concern_uploads(p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.concern_attachments set state = 'removed', removed_at = clock_timestamp()
    where id in (select id from public.concern_attachments
        where state in ('pending', 'ready') and created_at < clock_timestamp() - interval '24 hours'
        order by created_at limit greatest(coalesce(p_limit, 200), 1) for update skip locked)
      and state in ('pending', 'ready');
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function edra_private.expire_concern_uploads(integer) from public, anon, authenticated;

-- Service role: leases up to `p_limit` removed objects for deletion, re-leasing after 10 minutes.
-- Objects whose upload URLs may still be valid wait, so a late upload is deleted rather than orphaned.
create function public.claim_concern_media_purge(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  with picked as (
    select id from public.concern_attachments
    where state = 'removed' and purged_at is null
      and (purge_claimed_at is null or purge_claimed_at < clock_timestamp() - interval '10 minutes')
      and (upload_expires_at is null or upload_expires_at < clock_timestamp())
    order by removed_at limit least(greatest(coalesce(p_limit, 20), 1), 100) for update skip locked),
  leased as (
    update public.concern_attachments a set purge_claimed_at = clock_timestamp() from picked
    where a.id = picked.id returning a.id, a.storage_path)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', storage_path)), '[]'::jsonb) into result from leased;
  return result;
end $$;

create function public.complete_concern_media_purge(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.concern_attachments set purged_at = clock_timestamp()
    where id = any(coalesce(p_ids, '{}')) and state = 'removed' and purged_at is null;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads gain media summaries; deleted messages expose none.

create or replace function public.concern_inbox(p_academy_id uuid, p_status text default null, p_limit integer default 50,
  p_before_updated_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if p_status is not null and p_status not in ('ongoing', 'settled') then perform edra_private.concern_fail('validation'); end if;
  return (with picked as (
      select c, mine.last_read_seq, mine.muted
      from edra_private.my_concerns(p_academy_id) mine
      join public.concerns c on c.id = mine.concern_id
      where (p_status is null or c.status = p_status)
        and (p_before_updated_at is null or (c.updated_at, c.id) < (p_before_updated_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by c.updated_at desc, c.id desc limit lim + 1)
    select jsonb_build_object('hasMore', (select count(*) from picked) > lim, 'concerns', coalesce((
      select jsonb_agg(jsonb_build_object('id', (r.c).id, 'title', (r.c).title, 'status', (r.c).status,
          'updatedAt', (r.c).updated_at, 'muted', r.muted, 'lastReadSeq', r.last_read_seq,
          'unread', (select count(*) from public.concern_messages m where m.concern_id = (r.c).id
            and m.seq > r.last_read_seq and m.author_id <> auth.uid() and m.deleted_at is null),
          'unreadMentions', (select count(*) from public.concern_messages m where m.concern_id = (r.c).id
            and m.seq > r.last_read_seq and m.deleted_at is null and auth.uid() = any(m.mentions)),
          'last', (select jsonb_build_object('seq', l.seq, 'authorId', l.author_id,
              'authorName', (select full_name from public.profiles where id = l.author_id),
              'body', l.body, 'deleted', l.deleted_at is not null, 'createdAt', l.created_at,
              'media', edra_private.concern_media_summary(l.id))
            from public.concern_messages l where l.concern_id = (r.c).id order by l.seq desc limit 1))
        order by (r.c).updated_at desc, (r.c).id desc)
      from (select * from picked order by (c).updated_at desc, (c).id desc limit lim) r), '[]'::jsonb)));
end $$;

-- Live message text and live attachment names; deleted messages and their media never match.
create or replace function public.search_concerns(p_academy_id uuid, p_query text, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); pattern text;
begin
  if p_query is null or char_length(btrim(p_query)) not between 2 and 100 then perform edra_private.concern_fail('validation'); end if;
  pattern := '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((select jsonb_agg(hit order by happened desc, kind, id) from (
    (select jsonb_build_object('concernId', c.id, 'title', c.title, 'status', c.status, 'messageId', null,
        'seq', null, 'body', null, 'authorName', null, 'createdAt', c.updated_at, 'media', null) as hit,
        c.updated_at as happened, 0 as kind, c.id as id
      from edra_private.my_concerns(p_academy_id) mine join public.concerns c on c.id = mine.concern_id
      where c.title ilike pattern order by c.updated_at desc limit lim)
    union all
    (select jsonb_build_object('concernId', c.id, 'title', c.title, 'status', c.status, 'messageId', m.id,
        'seq', m.seq, 'body', m.body, 'authorName', (select full_name from public.profiles where id = m.author_id),
        'createdAt', m.created_at, 'media', edra_private.concern_media_summary(m.id)), m.created_at, 1, m.id
      from edra_private.my_concerns(p_academy_id) mine
      join public.concerns c on c.id = mine.concern_id
      join public.concern_messages m on m.concern_id = c.id
      where m.deleted_at is null and (m.body ilike pattern or exists (select 1 from public.concern_attachments a
        where a.message_id = m.id and a.state = 'bound' and a.name ilike pattern))
      order by m.created_at desc limit lim)
    order by happened desc limit lim) hits), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function public.send_concern_message(uuid, uuid, uuid, text, uuid, uuid[], uuid[]),
  public.reserve_concern_attachment(uuid, uuid, uuid, text, text, bigint),
  public.concern_attachment_upload(uuid, uuid, uuid),
  public.discard_concern_attachment(uuid, uuid, uuid),
  public.concern_attachment_access(uuid, uuid, uuid),
  public.verify_concern_attachment(uuid, boolean, text, numeric),
  public.claim_concern_media_purge(integer),
  public.complete_concern_media_purge(uuid[])
  from public, anon, authenticated;
grant execute on function public.send_concern_message(uuid, uuid, uuid, text, uuid, uuid[], uuid[]),
  public.reserve_concern_attachment(uuid, uuid, uuid, text, text, bigint),
  public.concern_attachment_upload(uuid, uuid, uuid),
  public.discard_concern_attachment(uuid, uuid, uuid),
  public.concern_attachment_access(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.verify_concern_attachment(uuid, boolean, text, numeric),
  public.claim_concern_media_purge(integer),
  public.complete_concern_media_purge(uuid[])
  to service_role;

-- Every 10 minutes, revoke at most 500 unsent uploads older than a day.
create extension if not exists pg_cron;
select cron.schedule('edra-concern-upload-expiry', '*/10 * * * *', 'select edra_private.expire_concern_uploads(500)');
