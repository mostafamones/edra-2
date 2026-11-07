-- Concern notifications (EDRA-296): in-app notifications and browser push delivery.
--
-- A trigger on concern_events turns each new activity into one notification per current recipient,
-- in the same transaction as the concern action, and queues one push delivery per registered
-- browser of that recipient. Only events written after this migration notify: nothing is
-- backfilled. The trusted Worker claims leased delivery batches with the service role, reads the
-- CURRENT message and authority at claim time (deleted/removed/revoked/muted/focused/read work is
-- skipped), sends Web Push and reports each outcome. Delivery failure never touches the concern.
--
-- Recipients: being added (the added person), new messages (every other current participant;
-- muted participants skip ordinary messages), mentions (always), settlement and reopening (every
-- other current participant). Owner recovery, removals, edits, deletions, reactions and read
-- receipts do not notify. The opening message notifies only mentions; being added covers the rest.

-- ---------------------------------------------------------------------------------------------
-- In-app notifications. Browsers read them only through the functions below, which recheck
-- current concern access for every row.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id),
  recipient_id uuid not null references public.profiles(id),
  event_id uuid not null references public.concern_events(id),
  kind text not null check (kind in ('concern_added', 'concern_message', 'concern_mention', 'concern_settled', 'concern_reopened')),
  concern_id uuid not null,
  message_id uuid,
  seq bigint,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (event_id, recipient_id),
  foreign key (academy_id, concern_id) references public.concerns(academy_id, id),
  check ((kind in ('concern_message', 'concern_mention')) = (message_id is not null and seq is not null))
);
create index notifications_recipient_idx on public.notifications(recipient_id, academy_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications(recipient_id, concern_id) where read_at is null;

-- One row per browser push subscription. The endpoint is restricted to the known browser push
-- services so the Worker never posts to a caller-chosen host.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 2048 and endpoint ~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:][:cntrl:]#]*$'),
  p256dh text not null check (p256dh ~ '^B[A-Za-z0-9_-]{86}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Outbox: one row per (notification, browser). Stable identity deduplicates delivery.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  -- Late activity is not worth a push: undelivered items expire.
  expires_at timestamptz not null default clock_timestamp() + interval '1 hour',
  finished_at timestamptz,
  last_status integer,
  unique (notification_id, subscription_id),
  check ((state = 'pending') = (finished_at is null))
);
create index notification_deliveries_due_idx on public.notification_deliveries(next_attempt_at) where state = 'pending';
create index notification_deliveries_finished_idx on public.notification_deliveries(finished_at) where state <> 'pending';
create index notification_deliveries_subscription_idx on public.notification_deliveries(subscription_id);

-- Per-tab "this concern is visibly open and focused" heartbeats. The user comes from the session;
-- the client id only separates tabs. Rows older than the TTL are ignored.
create table edra_private.concern_focus (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  academy_id uuid not null,
  concern_id uuid not null references public.concerns(id),
  seen_at timestamptz not null,
  primary key (user_id, client_id)
);
create index concern_focus_concern_idx on edra_private.concern_focus(concern_id, user_id, seen_at);

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;
alter table edra_private.concern_focus enable row level security;
revoke all on public.notifications, public.push_subscriptions, public.notification_deliveries from public, anon, authenticated;
revoke all on edra_private.concern_focus from public, anon, authenticated;
grant all on public.notifications, public.push_subscriptions, public.notification_deliveries to service_role;
-- No browser policies: reads and writes go through the functions below.

-- ---------------------------------------------------------------------------------------------
-- Creation, atomic with the concern action.

create function edra_private.concern_event_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mentioned uuid[]; message_seq bigint;
begin
  if new.kind = 'participant_added' and new.subject_id is distinct from new.actor_id then
    insert into public.notifications (academy_id, recipient_id, event_id, kind, concern_id, actor_id)
      select new.academy_id, r, new.id, 'concern_added', new.concern_id, new.actor_id
      from edra_private.concern_recipients(new.academy_id, new.concern_id) r where r = new.subject_id;
  elsif new.kind in ('settled', 'reopened') then
    insert into public.notifications (academy_id, recipient_id, event_id, kind, concern_id, actor_id)
      select new.academy_id, r, new.id, 'concern_' || new.kind, new.concern_id, new.actor_id
      from edra_private.concern_recipients(new.academy_id, new.concern_id) r where r <> new.actor_id;
  elsif new.kind = 'message_sent' then
    message_seq := (new.detail->>'seq')::bigint;
    mentioned := array(select jsonb_array_elements_text(coalesce(new.detail->'mentions', '[]'::jsonb))::uuid);
    insert into public.notifications (academy_id, recipient_id, event_id, kind, concern_id, message_id, seq, actor_id)
      select new.academy_id, r, new.id,
        case when r = any(mentioned) then 'concern_mention' else 'concern_message' end,
        new.concern_id, new.subject_id, message_seq, new.actor_id
      from edra_private.concern_recipients(new.academy_id, new.concern_id) r
      join public.concern_participants p on p.concern_id = new.concern_id and p.user_id = r
      where r <> new.actor_id and (r = any(mentioned) or (message_seq > 1 and not p.muted));
  else
    return null;
  end if;
  insert into public.notification_deliveries (notification_id, subscription_id)
    select n.id, s.id from public.notifications n
    join public.push_subscriptions s on s.user_id = n.recipient_id
    where n.event_id = new.id;
  return null;
end $$;
create trigger concern_events_notify after insert on public.concern_events
  for each row execute function edra_private.concern_event_notifications();

-- Reading a conversation also reads its message notifications, on every device.
create function edra_private.concern_read_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set read_at = coalesce(new.read_at, clock_timestamp())
    where recipient_id = new.user_id and concern_id = new.concern_id and read_at is null
      and kind in ('concern_message', 'concern_mention') and seq <= new.last_read_seq;
  return null;
end $$;
create trigger concern_participants_read_notifications after update of last_read_seq on public.concern_participants
  for each row when (new.last_read_seq > old.last_read_seq) execute function edra_private.concern_read_notifications();

-- The browser preview of one notification, built from CURRENT state. Deleted messages and removed
-- media are never described.
create function edra_private.notification_json(n public.notifications)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'academyId', n.academy_id, 'concernId', n.concern_id, 'concernTitle', c.title,
    'messageId', n.message_id, 'actorName', (select full_name from public.profiles where id = n.actor_id),
    'createdAt', n.created_at, 'readAt', n.read_at,
    'body', case when m.deleted_at is null then left(m.body, 280) end,
    'media', case when m.id is not null and m.deleted_at is null then edra_private.concern_media_summary(m.id) end,
    'deleted', coalesce(m.deleted_at is not null, false))
  from public.concerns c
  left join public.concern_messages m on m.id = n.message_id
  where c.id = n.concern_id;
$$;

revoke all on function edra_private.concern_event_notifications(), edra_private.concern_read_notifications(),
  edra_private.notification_json(public.notifications) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Browser reads and commands. Every row rechecks current academy membership and participation.

-- shortcut: per-row access checks scan past rows of concerns the caller lost; index by access if histories grow large.
create function public.notification_inbox(p_academy_id uuid, p_before timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); ids uuid[];
begin
  if auth.uid() is null or not public.is_academy_member(p_academy_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  ids := array(select n.id from public.notifications n
    where n.recipient_id = auth.uid() and n.academy_id = p_academy_id
      and (p_before is null or (n.created_at, n.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      and public.concern_has_access(n.academy_id, n.concern_id)
    order by n.created_at desc, n.id desc limit lim + 1);
  return jsonb_build_object('items', coalesce((select jsonb_agg(edra_private.notification_json(n) order by n.created_at desc, n.id desc)
      from public.notifications n where n.id = any(ids[1:lim])), '[]'::jsonb),
    'hasMore', cardinality(ids) > lim);
end $$;

create function public.notification_unread(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_academy_member(p_academy_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('count', (select count(*) from public.notifications n
    where n.recipient_id = auth.uid() and n.academy_id = p_academy_id and n.read_at is null
      and public.concern_has_access(n.academy_id, n.concern_id)));
end $$;

-- Marks the caller's notifications read: the given ids, or all of them in the academy when null.
create function public.mark_notifications_read(p_academy_id uuid, p_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null or not public.is_academy_member(p_academy_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if cardinality(p_ids) > 100 then perform edra_private.concern_fail('validation'); end if;
  update public.notifications set read_at = clock_timestamp()
    where recipient_id = auth.uid() and academy_id = p_academy_id and read_at is null
      and (p_ids is null or id = any(p_ids));
  get diagnostics changed = row_count;
  return jsonb_build_object('marked', changed);
end $$;

-- A participant's own preference; allowed when settled (it is not a conversation write).
create function public.set_concern_muted(p_academy_id uuid, p_concern_id uuid, p_muted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_muted is null then perform edra_private.concern_fail('validation'); end if;
  perform edra_private.require_concern(p_academy_id, p_concern_id);
  update public.concern_participants set muted = p_muted where concern_id = p_concern_id and user_id = auth.uid();
  return jsonb_build_object('muted', p_muted);
end $$;

-- Heartbeat while a concern is visibly open and focused in one tab (null concern clears it).
-- Does not take the concern lock: it only suppresses ordinary message push for the caller.
create function public.set_concern_focus(p_academy_id uuid, p_concern_id uuid, p_client_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_client_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_concern_id is null then
    delete from edra_private.concern_focus where user_id = auth.uid() and client_id = p_client_id;
    return;
  end if;
  if not public.concern_has_access(p_academy_id, p_concern_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into edra_private.concern_focus values (auth.uid(), p_client_id, p_academy_id, p_concern_id, clock_timestamp())
    on conflict (user_id, client_id) do update set academy_id = excluded.academy_id, concern_id = excluded.concern_id, seen_at = excluded.seen_at;
end $$;

-- Registers this browser for the caller. An endpoint already registered moves to the caller only
-- when the same subscription keys are presented (possession of the browser's secret); its queued
-- deliveries for the previous account are dropped.
create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.push_subscriptions;
begin
  if actor is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into existing from public.push_subscriptions where endpoint = p_endpoint for update;
  if not found then
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (actor, p_endpoint, p_p256dh, p_auth)
      on conflict (endpoint) do nothing;
    if not found then perform edra_private.concern_fail('conflict'); end if;
  elsif existing.p256dh <> p_p256dh or existing.auth <> p_auth then
    perform edra_private.concern_fail('conflict');
  else
    update public.push_subscriptions set user_id = actor, updated_at = clock_timestamp() where id = existing.id;
    if existing.user_id <> actor then delete from public.notification_deliveries where subscription_id = existing.id; end if;
  end if;
  return jsonb_build_object('registered', true);
exception when check_violation then perform edra_private.concern_fail('validation');
end $$;

-- 'mine', 'other' or 'none' for this browser's subscription, proven by its auth secret.
create function public.push_subscription_state(p_endpoint text, p_auth text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('state', coalesce((select case when user_id = auth.uid() then 'mine' else 'other' end
    from public.push_subscriptions where endpoint = p_endpoint and auth = p_auth and auth.uid() is not null), 'none'));
$$;

-- Removes this browser's subscription whoever registered it (possession proves it is this browser).
create function public.release_push_subscription(p_endpoint text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and auth = p_auth;
end $$;

-- Global sign-out: stop every browser push for the caller.
create function public.forget_push_subscriptions()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.push_subscriptions where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------------------------
-- Trusted dispatch (service role only).

-- Leases up to p_limit due deliveries for 2 minutes and returns what to send. Each is judged
-- against CURRENT state; anything no longer deliverable is finished as skipped and not returned.
create function public.claim_notification_deliveries(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 20), 1), 100); now_at timestamptz := clock_timestamp();
  d public.notification_deliveries; n public.notifications; s public.push_subscriptions; msg public.concern_messages;
  ok boolean; batch jsonb := '[]'::jsonb;
begin
  for d in select * from public.notification_deliveries
    where state = 'pending' and next_attempt_at <= now_at and (lease_until is null or lease_until <= now_at)
    order by next_attempt_at, id limit lim for update skip locked loop
    select * into n from public.notifications where id = d.notification_id;
    select * into s from public.push_subscriptions where id = d.subscription_id;
    select * into msg from public.concern_messages where id = n.message_id;
    ok := d.expires_at > now_at and d.attempts < 5 and s.user_id = n.recipient_id and n.read_at is null
      and edra_private.concern_user_active(n.academy_id, n.concern_id, n.recipient_id)
      and (n.message_id is null or (msg.id is not null and msg.deleted_at is null));
    if ok and n.kind = 'concern_message' then
      ok := not exists (select 1 from public.concern_participants where concern_id = n.concern_id and user_id = n.recipient_id and muted)
        and not exists (select 1 from edra_private.concern_focus f where f.user_id = n.recipient_id and f.concern_id = n.concern_id
          and f.academy_id = n.academy_id and f.seen_at > now_at - interval '45 seconds');
    end if;
    if not ok then
      update public.notification_deliveries set state = case when attempts >= 5 then 'failed' else 'skipped' end,
        finished_at = now_at, lease_until = null where id = d.id;
      continue;
    end if;
    update public.notification_deliveries set attempts = attempts + 1, lease_until = now_at + interval '2 minutes' where id = d.id;
    batch := batch || jsonb_build_object('deliveryId', d.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'academySlug', (select slug from public.academies where id = n.academy_id),
      'notification', edra_private.notification_json(n));
  end loop;
  return batch;
end $$;

-- Records one delivery outcome: sent, gone (404/410: the subscription is deleted), retry
-- (backoff 30 s doubling, at least Retry-After, at most 15 min; failed after 5 attempts) or failed.
create function public.complete_notification_delivery(p_delivery_id uuid, p_outcome text, p_status integer default null,
  p_retry_after integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_deliveries;
begin
  select * into d from public.notification_deliveries where id = p_delivery_id and state = 'pending' for update;
  if not found then return; end if;
  if p_outcome = 'sent' then
    update public.notification_deliveries set state = 'sent', finished_at = clock_timestamp(), lease_until = null, last_status = p_status where id = d.id;
    update public.push_subscriptions set last_success_at = clock_timestamp() where id = d.subscription_id;
  elsif p_outcome = 'gone' then
    delete from public.push_subscriptions where id = d.subscription_id;
  elsif p_outcome = 'retry' and d.attempts < 5 then
    update public.notification_deliveries set lease_until = null, last_status = p_status,
      next_attempt_at = clock_timestamp() + make_interval(secs => least(900, greatest(coalesce(p_retry_after, 0), 30 * power(2, greatest(d.attempts - 1, 0)))))
      where id = d.id;
  else
    update public.notification_deliveries set state = 'failed', finished_at = clock_timestamp(), lease_until = null, last_status = p_status where id = d.id;
  end if;
end $$;

-- Finished deliveries and stale focus rows are housekeeping only.
create function edra_private.prune_notification_state() returns void
language sql security definer set search_path = '' as $$
  delete from public.notification_deliveries where id in (select id from public.notification_deliveries
    where state <> 'pending' and finished_at < clock_timestamp() - interval '7 days' limit 5000);
  delete from edra_private.concern_focus where seen_at < clock_timestamp() - interval '1 day';
$$;
revoke all on function edra_private.prune_notification_state() from public, anon, authenticated;
select cron.schedule('edra-notification-prune', '23 * * * *', 'select edra_private.prune_notification_state()');

revoke all on function public.notification_inbox(uuid, timestamptz, uuid, integer), public.notification_unread(uuid),
  public.mark_notifications_read(uuid, uuid[]), public.set_concern_muted(uuid, uuid, boolean),
  public.set_concern_focus(uuid, uuid, uuid), public.register_push_subscription(text, text, text),
  public.push_subscription_state(text, text), public.release_push_subscription(text, text), public.forget_push_subscriptions(),
  public.claim_notification_deliveries(integer), public.complete_notification_delivery(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.notification_inbox(uuid, timestamptz, uuid, integer), public.notification_unread(uuid),
  public.mark_notifications_read(uuid, uuid[]), public.set_concern_muted(uuid, uuid, boolean),
  public.set_concern_focus(uuid, uuid, uuid), public.register_push_subscription(text, text, text),
  public.push_subscription_state(text, text), public.release_push_subscription(text, text), public.forget_push_subscriptions()
  to authenticated;
grant execute on function public.claim_notification_deliveries(integer), public.complete_notification_delivery(uuid, text, integer, integer)
  to service_role;
