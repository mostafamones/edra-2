-- Concern messaging and live state (EDRA-293), plus the minimum atomic creation messaging needs.
-- Every write locks the concern through edra_private.require_concern, so per-concern sequence
-- numbers and revisions are allocated and committed in order. Clients page by `seq` and recover
-- every send/edit/delete/reaction after a reconnect by asking for `revision > cursor`.

-- Global, but allocated only while the concern row is locked: within one concern revisions commit in order.
create sequence public.concern_revision_seq;
revoke all on sequence public.concern_revision_seq from public, anon, authenticated;

create table public.concern_messages (
  id uuid primary key,
  academy_id uuid not null,
  concern_id uuid not null,
  seq bigint not null check (seq > 0),
  revision bigint not null,
  author_id uuid not null references public.profiles(id),
  -- Null only once deleted; media-only messages (EDRA-294) will relax the live-message rule in its command.
  body text check (body is null or char_length(body) between 1 and 4000),
  reply_to_id uuid,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  unique (concern_id, seq),
  unique (concern_id, id),
  foreign key (academy_id, concern_id) references public.concerns(academy_id, id),
  foreign key (concern_id, reply_to_id) references public.concern_messages(concern_id, id),
  -- Deletion removes the text and mentions; no edit history is kept.
  check (deleted_at is null or (body is null and mentions = '{}' and edited_at is null))
);
create index concern_messages_revision_idx on public.concern_messages(concern_id, revision);

create table public.concern_reactions (
  message_id uuid not null references public.concern_messages(id),
  user_id uuid not null references public.profiles(id),
  emoji text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[[:space:][:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (message_id, user_id, emoji)
);

-- Mandatory read receipts: the latest message each participant has viewed. Never moves backwards.
alter table public.concern_participants
  add column last_read_seq bigint not null default 0 check (last_read_seq >= 0),
  add column read_at timestamptz;

alter table public.concern_messages enable row level security;
alter table public.concern_reactions enable row level security;
revoke all on public.concern_messages, public.concern_reactions from public, anon, authenticated;
grant select on public.concern_messages, public.concern_reactions to authenticated;
grant all on public.concern_messages, public.concern_reactions to service_role;
create policy concern_messages_read on public.concern_messages for select to authenticated
  using (public.concern_has_access(academy_id, concern_id));
create policy concern_reactions_read on public.concern_reactions for select to authenticated
  using (exists (select 1 from public.concern_messages m
    where m.id = message_id and public.concern_has_access(m.academy_id, m.concern_id)));

-- ---------------------------------------------------------------------------------------------
-- Private helpers (never granted).

create function edra_private.concern_fail(code text) returns void language plpgsql set search_path = '' as $$
begin raise exception using errcode = 'P0001', message = code; end $$;

-- The caller's accessible concerns in one academy, with their read state. Same rule as concern_has_access.
create function edra_private.my_concerns(p_academy_id uuid)
returns table (concern_id uuid, last_read_seq bigint, muted boolean)
language sql stable security definer set search_path = '' as $$
  select p.concern_id, p.last_read_seq, p.muted
  from public.concern_participants p
  join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
  where public.is_academy_member(p_academy_id) and p.academy_id = p_academy_id
    and p.user_id = auth.uid() and p.removed_at is null
    and m.suspended_at is null and m.created_at = p.membership_created_at;
$$;

-- The only message shape returned to clients. Deleted text never leaves the database, including in quotes.
create function edra_private.concern_message_json(m public.concern_messages)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'concernId', m.concern_id, 'seq', m.seq, 'revision', m.revision,
    'authorId', m.author_id, 'authorName', (select full_name from public.profiles where id = m.author_id),
    'body', m.body, 'mentions', to_jsonb(m.mentions),
    'createdAt', m.created_at, 'editedAt', m.edited_at, 'deletedAt', m.deleted_at,
    'replyTo', (select jsonb_build_object('id', r.id, 'seq', r.seq, 'authorId', r.author_id,
        'authorName', (select full_name from public.profiles where id = r.author_id),
        'body', r.body, 'deleted', r.deleted_at is not null)
      from public.concern_messages r where r.concern_id = m.concern_id and r.id = m.reply_to_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'userIds', x.users) order by x.first, x.emoji)
      from (select emoji, jsonb_agg(user_id order by created_at, user_id) users, min(created_at) first
            from public.concern_reactions where message_id = m.id group by emoji) x), '[]'::jsonb),
    'attachments', '[]'::jsonb);
$$;

-- Mentions must name current participants with live academy membership.
create function edra_private.concern_mentions(p_concern_id uuid, p_mentions uuid[])
returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare clean uuid[] := array(select distinct x from unnest(coalesce(p_mentions, '{}')) x where x is not null order by x);
begin
  if cardinality(clean) > 50 or exists (select 1 from unnest(clean) u where not exists (
    select 1 from public.concern_participants p
    join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
    where p.concern_id = p_concern_id and p.user_id = u and p.removed_at is null
      and m.suspended_at is null and m.created_at = p.membership_created_at)) then
    perform edra_private.concern_fail('invalid_mention');
  end if;
  return clean;
end $$;

create function edra_private.check_concern_body(p_body text) returns void language plpgsql set search_path = '' as $$
begin
  if p_body is null or btrim(p_body) = '' or char_length(p_body) > 4000 then
    perform edra_private.concern_fail('validation');
  end if;
end $$;

-- Appends one message to a concern the caller has already locked and may write.
create function edra_private.post_concern_message(item public.concerns, p_message_id uuid, p_body text,
  p_reply_to_id uuid, p_mentions uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare msg public.concern_messages; clean uuid[]; next_seq bigint;
begin
  if p_message_id is null then perform edra_private.concern_fail('validation'); end if;
  perform edra_private.check_concern_body(p_body);
  if p_reply_to_id is not null and not exists (select 1 from public.concern_messages
      where concern_id = item.id and id = p_reply_to_id and deleted_at is null) then
    perform edra_private.concern_fail('reply_unavailable');
  end if;
  clean := edra_private.concern_mentions(item.id, p_mentions);
  select coalesce(max(seq), 0) + 1 into next_seq from public.concern_messages where concern_id = item.id;
  insert into public.concern_messages (id, academy_id, concern_id, seq, revision, author_id, body, reply_to_id, mentions)
    values (p_message_id, item.academy_id, item.id, next_seq, nextval('public.concern_revision_seq'),
      auth.uid(), p_body, p_reply_to_id, clean)
    returning * into msg;
  update public.concerns set updated_at = msg.created_at where id = item.id;
  -- The author has seen their own message.
  update public.concern_participants set last_read_seq = next_seq, read_at = msg.created_at
    where concern_id = item.id and user_id = auth.uid();
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (item.academy_id, item.id, auth.uid(), 'message_sent', msg.id,
      jsonb_build_object('seq', msg.seq, 'mentions', to_jsonb(clean)));
  return edra_private.concern_message_json(msg);
end $$;

revoke all on function edra_private.concern_fail(text), edra_private.my_concerns(uuid),
  edra_private.concern_message_json(public.concern_messages), edra_private.concern_mentions(uuid, uuid[]),
  edra_private.check_concern_body(text),
  edra_private.post_concern_message(public.concerns, uuid, text, uuid, uuid[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Commands. The caller chooses message/concern ids so a retried request returns what it already made.

-- Minimum creation for messaging; participant management, recovery and settlement are EDRA-292.
create function public.create_concern(p_academy_id uuid, p_concern_id uuid, p_message_id uuid, p_title text,
  p_body text, p_participant_ids uuid[], p_whole_team boolean default false, p_mentions uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; actor uuid := auth.uid();
begin
  if actor is null or not public.is_academy_manager(p_academy_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_concern_id is null or p_message_id is null or p_title is null or btrim(p_title) = ''
    or char_length(p_title) > 120 or cardinality(coalesce(p_participant_ids, '{}')) > 500 then
    perform edra_private.concern_fail('validation');
  end if;
  perform edra_private.check_concern_body(p_body);
  -- A concurrent retry of the same id waits here for the first transaction, then finds its concern.
  insert into public.concerns (id, academy_id, title, created_by)
    values (p_concern_id, p_academy_id, btrim(p_title), actor)
    on conflict (id) do nothing returning * into item;
  if item.id is null then
    select * into item from public.concerns where id = p_concern_id;
    if item.academy_id <> p_academy_id or item.created_by <> actor
      or not exists (select 1 from public.concern_messages where concern_id = item.id and id = p_message_id and seq = 1) then
      perform edra_private.concern_fail('conflict');
    end if;
    -- Retrying creation is still a read: creator identity never bypasses current participation.
    item := edra_private.require_concern(p_academy_id, p_concern_id);
    return jsonb_build_object('concernId', item.id, 'message',
      (select edra_private.concern_message_json(m) from public.concern_messages m where m.id = p_message_id));
  end if;
  if exists (select 1 from unnest(coalesce(p_participant_ids, '{}')) u where u is null or not exists (
    select 1 from public.academy_memberships m where m.academy_id = p_academy_id and m.user_id = u and m.suspended_at is null)) then
    perform edra_private.concern_fail('invalid_participant');
  end if;
  -- Whole team is a snapshot of current active staff; future staff are added explicitly.
  insert into public.concern_participants (academy_id, concern_id, user_id, membership_created_at, added_by)
    select p_academy_id, p_concern_id, m.user_id, m.created_at, actor
    from public.academy_memberships m
    where m.academy_id = p_academy_id and m.suspended_at is null
      and (coalesce(p_whole_team, false) or m.user_id = actor or m.user_id = any(p_participant_ids));
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, detail)
    values (p_academy_id, p_concern_id, actor, 'created', jsonb_build_object('wholeTeam', coalesce(p_whole_team, false)));
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id)
    select p_academy_id, p_concern_id, actor, 'participant_added', p.user_id
    from public.concern_participants p where p.concern_id = p_concern_id order by p.user_id;
  return jsonb_build_object('concernId', p_concern_id, 'message',
    edra_private.post_concern_message(item, p_message_id, p_body, null, p_mentions));
end $$;

create function public.send_concern_message(p_academy_id uuid, p_concern_id uuid, p_message_id uuid,
  p_body text, p_reply_to_id uuid default null, p_mentions uuid[] default '{}')
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
  return edra_private.post_concern_message(item, p_message_id, p_body, p_reply_to_id, p_mentions);
end $$;

-- Authors edit within 300 seconds of the original send, measured by the database clock.
create function public.edit_concern_message(p_academy_id uuid, p_concern_id uuid, p_message_id uuid,
  p_body text, p_mentions uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; msg public.concern_messages; clean uuid[];
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id, true);
  select * into msg from public.concern_messages where concern_id = p_concern_id and id = p_message_id;
  if not found then perform edra_private.concern_fail('message_not_found'); end if;
  if msg.author_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if msg.deleted_at is not null then perform edra_private.concern_fail('message_deleted'); end if;
  perform edra_private.check_concern_body(p_body);
  clean := edra_private.concern_mentions(p_concern_id, p_mentions);
  -- An identical retry succeeds even after the window closes.
  if msg.body = p_body and msg.mentions = clean then return edra_private.concern_message_json(msg); end if;
  if clock_timestamp() > msg.created_at + interval '300 seconds' then perform edra_private.concern_fail('edit_expired'); end if;
  update public.concern_messages set body = p_body, mentions = clean, edited_at = clock_timestamp(),
    revision = nextval('public.concern_revision_seq')
    where id = msg.id returning * into msg;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (item.academy_id, item.id, auth.uid(), 'message_edited', msg.id,
      jsonb_build_object('seq', msg.seq, 'mentions', to_jsonb(clean)));
  return edra_private.concern_message_json(msg);
end $$;

-- Authors delete their own messages anytime while ongoing. Replies stay attached to the placeholder.
create function public.delete_concern_message(p_academy_id uuid, p_concern_id uuid, p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; msg public.concern_messages;
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id, true);
  select * into msg from public.concern_messages where concern_id = p_concern_id and id = p_message_id;
  if not found then perform edra_private.concern_fail('message_not_found'); end if;
  if msg.author_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if msg.deleted_at is not null then return edra_private.concern_message_json(msg); end if;
  delete from public.concern_reactions where message_id = msg.id;
  update public.concern_messages set body = null, mentions = '{}', edited_at = null, deleted_at = clock_timestamp(),
    revision = nextval('public.concern_revision_seq')
    where id = msg.id returning * into msg;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (item.academy_id, item.id, auth.uid(), 'message_deleted', msg.id, jsonb_build_object('seq', msg.seq));
  return edra_private.concern_message_json(msg);
end $$;

-- Adds or removes the caller's reaction. Repeating the same request changes nothing.
create function public.set_concern_reaction(p_academy_id uuid, p_concern_id uuid, p_message_id uuid,
  p_emoji text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare msg public.concern_messages; changed integer;
begin
  perform edra_private.require_concern(p_academy_id, p_concern_id, true);
  select * into msg from public.concern_messages where concern_id = p_concern_id and id = p_message_id;
  if not found then perform edra_private.concern_fail('message_not_found'); end if;
  if msg.deleted_at is not null then perform edra_private.concern_fail('message_deleted'); end if;
  if p_emoji is null or p_on is null or char_length(p_emoji) not between 1 and 16 or p_emoji ~ '[[:space:][:cntrl:]]' then
    perform edra_private.concern_fail('validation');
  end if;
  if p_on then
    if (select count(distinct emoji) from public.concern_reactions where message_id = msg.id and user_id = auth.uid()
        and emoji <> p_emoji) >= 20 then
      perform edra_private.concern_fail('validation');
    end if;
    insert into public.concern_reactions (message_id, user_id, emoji) values (msg.id, auth.uid(), p_emoji)
      on conflict do nothing;
  else
    delete from public.concern_reactions where message_id = msg.id and user_id = auth.uid() and emoji = p_emoji;
  end if;
  get diagnostics changed = row_count;
  if changed > 0 then
    update public.concern_messages set revision = nextval('public.concern_revision_seq') where id = msg.id returning * into msg;
  end if;
  return edra_private.concern_message_json(msg);
end $$;

-- Read state moves forward only and is allowed on settled concerns. Receipts cannot be disabled.
create function public.mark_concern_read(p_academy_id uuid, p_concern_id uuid, p_seq bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target bigint; state public.concern_participants;
begin
  perform edra_private.require_concern(p_academy_id, p_concern_id);
  if p_seq is null or p_seq < 0 then perform edra_private.concern_fail('validation'); end if;
  select least(p_seq, coalesce(max(seq), 0)) into target from public.concern_messages where concern_id = p_concern_id;
  update public.concern_participants set last_read_seq = target, read_at = clock_timestamp()
    where concern_id = p_concern_id and user_id = auth.uid() and last_read_seq < target;
  select * into state from public.concern_participants where concern_id = p_concern_id and user_id = auth.uid();
  return jsonb_build_object('lastReadSeq', state.last_read_seq, 'readAt', state.read_at);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Reads. Each checks live access; none locks the concern.

create function edra_private.require_concern_read(p_academy_id uuid, p_concern_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.concern_has_access(p_academy_id, p_concern_id) then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke all on function edra_private.require_concern_read(uuid, uuid) from public, anon, authenticated;

-- Concern, current participants and their receipts. Removed participants are not listed.
create function public.concern_detail(p_academy_id uuid, p_concern_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  return (select jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'createdAt', c.created_at,
      'createdBy', c.created_by, 'settledAt', c.settled_at, 'outcome', c.outcome,
      'lastSeq', (select coalesce(max(seq), 0) from public.concern_messages where concern_id = c.id),
      'muted', (select muted from public.concern_participants where concern_id = c.id and user_id = auth.uid()),
      'participants', (select coalesce(jsonb_agg(jsonb_build_object('userId', p.user_id, 'name', pr.full_name,
          'avatarPath', pr.avatar_path, 'lastReadSeq', p.last_read_seq, 'readAt', p.read_at) order by pr.full_name, p.user_id), '[]'::jsonb)
        from public.concern_participants p
        join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
          and m.suspended_at is null and m.created_at = p.membership_created_at
        join public.profiles pr on pr.id = p.user_id
        where p.concern_id = c.id and p.removed_at is null))
    from public.concerns c where c.id = p_concern_id);
end $$;

-- Newest-first pages by seq, returned oldest first. `cursor` is the concern's latest revision in the same snapshot.
create function public.concern_messages_page(p_academy_id uuid, p_concern_id uuid, p_before_seq bigint default null,
  p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  return (with page as (
      select m from public.concern_messages m
      where m.concern_id = p_concern_id and (p_before_seq is null or m.seq < p_before_seq)
      order by m.seq desc limit lim + 1)
    select jsonb_build_object(
      'messages', coalesce((select jsonb_agg(edra_private.concern_message_json(x.m) order by (x.m).seq)
        from (select m from page order by (m).seq desc limit lim) x), '[]'::jsonb),
      'hasMore', (select count(*) from page) > lim,
      'cursor', (select coalesce(max(revision), 0) from public.concern_messages where concern_id = p_concern_id)));
end $$;

-- Every message changed after `p_after_revision`, in commit order: new, edited, deleted and reacted.
create function public.concern_message_changes(p_academy_id uuid, p_concern_id uuid, p_after_revision bigint,
  p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  if p_after_revision is null then perform edra_private.concern_fail('validation'); end if;
  return (with changed as (
      select m from public.concern_messages m
      where m.concern_id = p_concern_id and m.revision > p_after_revision
      order by m.revision limit lim + 1),
    kept as (select m from changed order by (m).revision limit lim)
    select jsonb_build_object(
      'messages', coalesce((select jsonb_agg(edra_private.concern_message_json(k.m) order by (k.m).revision) from kept k), '[]'::jsonb),
      'hasMore', (select count(*) from changed) > lim,
      'cursor', coalesce((select max((k.m).revision) from kept k), p_after_revision)));
end $$;

-- The caller's concerns by latest activity, with unread and unread-mention counts.
create function public.concern_inbox(p_academy_id uuid, p_status text default null, p_limit integer default 50,
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
              'body', l.body, 'deleted', l.deleted_at is not null, 'createdAt', l.created_at)
            from public.concern_messages l where l.concern_id = (r.c).id order by l.seq desc limit 1))
        order by (r.c).updated_at desc, (r.c).id desc)
      from (select * from picked order by (c).updated_at desc, (c).id desc limit lim) r), '[]'::jsonb)));
end $$;

-- Unread totals across every permitted concern in the academy.
create function public.concern_unread(p_academy_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'concerns', count(distinct m.concern_id),
    'messages', count(m.id),
    'mentions', count(m.id) filter (where auth.uid() = any(m.mentions)))
  from edra_private.my_concerns(p_academy_id) mine
  join public.concern_messages m on m.concern_id = mine.concern_id
  where m.seq > mine.last_read_seq and m.author_id <> auth.uid() and m.deleted_at is null;
$$;

-- Case-insensitive substring search over permitted concern titles and live message text.
-- shortcut: unindexed ILIKE over the caller's concerns; add pg_trgm or full-text indexes if academies grow large.
create function public.search_concerns(p_academy_id uuid, p_query text, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); pattern text;
begin
  if p_query is null or char_length(btrim(p_query)) not between 2 and 100 then perform edra_private.concern_fail('validation'); end if;
  pattern := '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((select jsonb_agg(hit order by happened desc, kind, id) from (
    (select jsonb_build_object('concernId', c.id, 'title', c.title, 'status', c.status, 'messageId', null,
        'seq', null, 'body', null, 'authorName', null, 'createdAt', c.updated_at) as hit, c.updated_at as happened, 0 as kind, c.id as id
      from edra_private.my_concerns(p_academy_id) mine join public.concerns c on c.id = mine.concern_id
      where c.title ilike pattern order by c.updated_at desc limit lim)
    union all
    (select jsonb_build_object('concernId', c.id, 'title', c.title, 'status', c.status, 'messageId', m.id,
        'seq', m.seq, 'body', m.body, 'authorName', (select full_name from public.profiles where id = m.author_id),
        'createdAt', m.created_at), m.created_at, 1, m.id
      from edra_private.my_concerns(p_academy_id) mine
      join public.concerns c on c.id = mine.concern_id
      join public.concern_messages m on m.concern_id = c.id
      where m.deleted_at is null and m.body ilike pattern order by m.created_at desc limit lim)
    order by happened desc limit lim) hits), '[]'::jsonb);
end $$;

revoke all on function public.create_concern(uuid, uuid, uuid, text, text, uuid[], boolean, uuid[]),
  public.send_concern_message(uuid, uuid, uuid, text, uuid, uuid[]),
  public.edit_concern_message(uuid, uuid, uuid, text, uuid[]),
  public.delete_concern_message(uuid, uuid, uuid),
  public.set_concern_reaction(uuid, uuid, uuid, text, boolean),
  public.mark_concern_read(uuid, uuid, bigint),
  public.concern_detail(uuid, uuid),
  public.concern_messages_page(uuid, uuid, bigint, integer),
  public.concern_message_changes(uuid, uuid, bigint, integer),
  public.concern_inbox(uuid, text, integer, timestamptz, uuid),
  public.concern_unread(uuid),
  public.search_concerns(uuid, text, integer)
  from public, anon;
grant execute on function public.create_concern(uuid, uuid, uuid, text, text, uuid[], boolean, uuid[]),
  public.send_concern_message(uuid, uuid, uuid, text, uuid, uuid[]),
  public.edit_concern_message(uuid, uuid, uuid, text, uuid[]),
  public.delete_concern_message(uuid, uuid, uuid),
  public.set_concern_reaction(uuid, uuid, uuid, text, boolean),
  public.mark_concern_read(uuid, uuid, bigint),
  public.concern_detail(uuid, uuid),
  public.concern_messages_page(uuid, uuid, bigint, integer),
  public.concern_message_changes(uuid, uuid, bigint, integer),
  public.concern_inbox(uuid, text, integer, timestamptz, uuid),
  public.concern_unread(uuid),
  public.search_concerns(uuid, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime. Commit-backed hints carry ids and revisions only, never message content: a client that
-- lost access learns nothing it can read, and refetching through the commands above is refused.
--   concern:<academy>:<concern>        changed{revision}, participants{}, concern{}; typing via presence
--   concern-inbox:<user>:<academy>     activity{concernId}

create function edra_private.broadcast_concern_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('revision', new.revision), 'changed',
    'concern:' || new.academy_id || ':' || new.concern_id, true);
  perform realtime.send(jsonb_build_object('concernId', new.concern_id), 'activity',
    'concern-inbox:' || p.user_id || ':' || new.academy_id, true)
    from public.concern_participants p where p.concern_id = new.concern_id and p.removed_at is null;
  return null;
end $$;
create trigger concern_messages_broadcast after insert or update on public.concern_messages
  for each row execute function edra_private.broadcast_concern_message();

-- Receipts, additions and removals: viewers refetch the participant list, which rechecks their own access.
create function edra_private.broadcast_concern_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'participants', 'concern:' || new.academy_id || ':' || new.concern_id, true);
  perform realtime.send(jsonb_build_object('concernId', new.concern_id), 'activity',
    'concern-inbox:' || new.user_id || ':' || new.academy_id, true);
  return null;
end $$;
create trigger concern_participants_broadcast after insert or update on public.concern_participants
  for each row execute function edra_private.broadcast_concern_participant();

create function edra_private.broadcast_concern_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'concern', 'concern:' || new.academy_id || ':' || new.id, true);
  perform realtime.send(jsonb_build_object('concernId', new.id), 'activity',
    'concern-inbox:' || p.user_id || ':' || new.academy_id, true)
    from public.concern_participants p where p.concern_id = new.id and p.removed_at is null;
  return null;
end $$;
create trigger concerns_broadcast after update on public.concerns
  for each row when (old.status is distinct from new.status or old.title is distinct from new.title)
  execute function edra_private.broadcast_concern_change();

revoke all on function edra_private.broadcast_concern_message(), edra_private.broadcast_concern_participant(),
  edra_private.broadcast_concern_change() from public, anon, authenticated;

-- A concern topic requires current access; an inbox topic is the caller's own, in an academy they belong to.
create function public.can_join_concern_channel(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[];
begin
  parts := regexp_match(p_topic,
    '^concern:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if parts is not null then return public.concern_has_access(parts[1]::uuid, parts[2]::uuid); end if;
  parts := regexp_match(p_topic,
    '^concern-inbox:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if parts is not null then return parts[1]::uuid = auth.uid() and public.is_academy_member(parts[2]::uuid); end if;
  return false;
end $$;
revoke all on function public.can_join_concern_channel(text) from public, anon;
grant execute on function public.can_join_concern_channel(text) to authenticated;

-- Participants receive hints and presence; they may send presence (typing) but never broadcasts.
create policy concern_channel_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and public.can_join_concern_channel(realtime.topic()));
create policy concern_channel_presence on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and realtime.topic() like 'concern:%'
    and public.can_join_concern_channel(realtime.topic()));
