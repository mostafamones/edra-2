-- Concern notifications: grants, atomic recipients per activity (added, message, mention, settle,
-- reopen; never the actor, Owner recovery, removals or revoked members), mute exceptions, read
-- coupling, current-access reads and previews, cross-user/academy isolation, push registration and
-- possession transfer, leased claims judged on current state (focus TTL, mute, deletion,
-- revocation, read, expiry), outcome handling and failure isolation. CI runs this only on its
-- disposable database.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Concern notification check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table nt_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into nt_ids(name) values ('owner'),('admin'),('member'),('mutee'),('spare'),('outsider'),('academy'),('other'),
  ('thread'),('foreign'),('m1'),('m2'),('m3'),('m4'),('m5'),('m6'),('m7'),('m8'),('f1'),('tab'),('tab2');
grant select on pg_temp.nt_ids to authenticated, service_role;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.nt_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(label)::text,''), true)
$$;
-- Run as the connecting role (after `reset role`).
create function pg_temp.notified(p_recipient text, p_kind text, p_message text default null) returns bigint language sql as $$
  select count(*) from public.notifications n where n.recipient_id = pg_temp.id(p_recipient) and n.kind = p_kind
    and (p_message is null or n.message_id = pg_temp.id(p_message)) $$;
create function pg_temp.send(actor text, message text, body text, mentions uuid[] default '{}') returns void language plpgsql as $$
begin
  perform pg_temp.act(actor);
  set local role authenticated;
  perform public.send_concern_message(pg_temp.id('academy'), pg_temp.id('thread'), pg_temp.id(message), body, null, mentions);
  reset role;
end $$;
create function pg_temp.claim() returns jsonb language plpgsql as $$
declare result jsonb;
begin
  set local role service_role;
  result := public.claim_notification_deliveries(50);
  reset role;
  return result;
end $$;
-- RFC 8291 example subscription keys; endpoints are synthetic and nothing is sent.
create function pg_temp.endpoint(label text) returns text language sql as $$ select 'https://fcm.googleapis.com/fcm/send/' || label $$;
create function pg_temp.p256dh() returns text language sql as $$ select 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4' $$;
create function pg_temp.auth() returns text language sql as $$ select 'BTBZMqHH6r4Tts7J_aSIgg' $$;

do $$ begin
  if has_table_privilege('authenticated','public.notifications','select') or has_table_privilege('anon','public.notifications','select')
    or has_table_privilege('authenticated','public.push_subscriptions','select') or has_table_privilege('authenticated','public.notification_deliveries','select')
    or has_table_privilege('authenticated','public.notifications','update')
    or has_function_privilege('authenticated','public.claim_notification_deliveries(integer)','execute')
    or has_function_privilege('authenticated','public.complete_notification_delivery(uuid,text,integer,integer)','execute')
    or has_function_privilege('anon','public.notification_inbox(uuid,timestamptz,uuid,integer)','execute')
    or has_function_privilege('anon','public.register_push_subscription(text,text,text)','execute')
    or not has_function_privilege('authenticated','public.notification_inbox(uuid,timestamptz,uuid,integer)','execute')
    or not has_function_privilege('authenticated','public.set_concern_muted(uuid,uuid,boolean)','execute')
    or not has_function_privilege('authenticated','public.set_concern_focus(uuid,uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.claim_notification_deliveries(integer)','execute')
    or has_function_privilege('authenticated','edra_private.notification_json(public.notifications)','execute') then
    raise exception 'Concern notification check failed: grants';
  end if;
  if not exists (select 1 from cron.job where jobname = 'edra-notification-prune') then
    raise exception 'Concern notification check failed: prune job scheduled';
  end if;
end $$;

insert into auth.users(id) select id from nt_ids where name in ('owner','admin','member','mutee','spare','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Notification fixture','concern-notify-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other notifications','concern-notify-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('member'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('mutee'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('spare'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));

-- Push registration happens before activity so deliveries are queued with the notifications.
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check(public.push_subscription_state(pg_temp.endpoint('member'), pg_temp.auth())->>'state' = 'none', 'unknown endpoint state');
select public.register_push_subscription(pg_temp.endpoint('member'), pg_temp.p256dh(), pg_temp.auth());
select public.register_push_subscription(pg_temp.endpoint('member'), pg_temp.p256dh(), pg_temp.auth()); -- idempotent
select pg_temp.check(public.push_subscription_state(pg_temp.endpoint('member'), pg_temp.auth())->>'state' = 'mine', 'own endpoint state');
select pg_temp.expect_error($$select public.register_push_subscription('https://evil.test/push', pg_temp.p256dh(), pg_temp.auth())$$, 'validation');
select pg_temp.expect_error($$select public.register_push_subscription('https://169.254.169.254/latest', pg_temp.p256dh(), pg_temp.auth())$$, 'validation');
select pg_temp.expect_error($$select public.register_push_subscription(pg_temp.endpoint('bad'), 'Bshort', pg_temp.auth())$$, 'validation');
select pg_temp.expect_error($$select public.register_push_subscription(pg_temp.endpoint('bad'), pg_temp.p256dh(), 'short')$$, 'validation');
reset role;
select pg_temp.act('mutee');
set local role authenticated;
select public.register_push_subscription(pg_temp.endpoint('mutee'), pg_temp.p256dh(), pg_temp.auth());
-- Another account cannot take an endpoint without its exact subscription keys.
select pg_temp.expect_error($$select public.register_push_subscription(pg_temp.endpoint('member'), pg_temp.p256dh(), 'AAAAAAAAAAAAAAAAAAAAAA')$$, 'conflict');
select pg_temp.check(public.push_subscription_state(pg_temp.endpoint('member'), pg_temp.auth())->>'state' = 'other', 'other account endpoint state');
select pg_temp.check(public.push_subscription_state(pg_temp.endpoint('member'), 'AAAAAAAAAAAAAAAAAAAAAA')->>'state' = 'none', 'state needs the auth secret');
reset role;

-- Creation: added participants are notified; the opening message notifies only mentions; never the actor.
select pg_temp.act('admin');
set local role authenticated;
select public.create_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m1'),'Late fees','Opening for @member',
  array[pg_temp.id('member'),pg_temp.id('mutee')], false, array[pg_temp.id('member')]);
reset role;
select pg_temp.check(pg_temp.notified('member','concern_added') = 1 and pg_temp.notified('mutee','concern_added') = 1, 'added participants notified');
select pg_temp.check(pg_temp.notified('member','concern_mention','m1') = 1, 'opening mention notified');
select pg_temp.check(pg_temp.notified('mutee','concern_message','m1') = 0, 'opening message covered by being added');
select pg_temp.check(not exists (select 1 from public.notifications where recipient_id = pg_temp.id('admin')), 'actor never notified');
select pg_temp.check((select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.recipient_id = pg_temp.id('member')) = 2, 'deliveries queued per registered browser');

-- Ordinary message, then mute: muted participants skip ordinary messages but keep mentions.
select pg_temp.send('admin','m2','Second');
select pg_temp.check(pg_temp.notified('member','concern_message','m2') = 1 and pg_temp.notified('mutee','concern_message','m2') = 1, 'ordinary message notified');
select pg_temp.act('mutee');
set local role authenticated;
select pg_temp.check((public.set_concern_muted(pg_temp.id('academy'),pg_temp.id('thread'),true)->>'muted')::boolean, 'mute own participation');
select pg_temp.expect_error($$select public.set_concern_muted(pg_temp.id('academy'),pg_temp.id('thread'),null)$$, 'validation');
reset role;
select pg_temp.check((select muted from public.concern_participants where concern_id = pg_temp.id('thread') and user_id = pg_temp.id('mutee')), 'mute stored');
select pg_temp.check(not (select muted from public.concern_participants where concern_id = pg_temp.id('thread') and user_id = pg_temp.id('member')), 'mute only the caller');
select pg_temp.send('admin','m3','Third');
select pg_temp.check(pg_temp.notified('mutee','concern_message','m3') = 0 and pg_temp.notified('member','concern_message','m3') = 1, 'muted ordinary message suppressed');
select pg_temp.send('admin','m4','Mention @mutee', array[pg_temp.id('mutee')]);
select pg_temp.check(pg_temp.notified('mutee','concern_mention','m4') = 1 and pg_temp.notified('member','concern_message','m4') = 1, 'mention bypasses mute; others ordinary');

-- Outsiders cannot mute or signal focus on a concern they cannot access.
select pg_temp.act('spare');
set local role authenticated;
select pg_temp.expect_error($$select public.set_concern_muted(pg_temp.id('academy'),pg_temp.id('thread'),true)$$, 'forbidden');
select pg_temp.expect_error($$select public.set_concern_focus(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('tab'))$$, 'forbidden');
select pg_temp.expect_error($$select public.notification_inbox(pg_temp.id('other'))$$, 'forbidden');
reset role;

-- Reads: own rows only, current previews, academy scoped, server totals.
select pg_temp.act('admin');
set local role authenticated;
select public.edit_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),'Second, edited','{}');
select public.delete_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'));
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check((public.notification_unread(pg_temp.id('academy'))->>'count')::int = 5, 'member unread total');
select pg_temp.check(jsonb_array_length(public.notification_inbox(pg_temp.id('academy'))->'items') = 5, 'member inbox count');
select pg_temp.check((select bool_and((x->>'concernTitle') = 'Late fees') from jsonb_array_elements(public.notification_inbox(pg_temp.id('academy'))->'items') x), 'titles');
select pg_temp.check((select x->>'body' from jsonb_array_elements(public.notification_inbox(pg_temp.id('academy'))->'items') x where x->>'messageId' = pg_temp.id('m2')::text) = 'Second, edited', 'preview is the current text');
select pg_temp.check((select (x->>'deleted')::boolean and x->'body' = 'null'::jsonb and x->'media' = 'null'::jsonb
  from jsonb_array_elements(public.notification_inbox(pg_temp.id('academy'))->'items') x where x->>'messageId' = pg_temp.id('m3')::text), 'deleted preview is cleared');
select pg_temp.check((public.notification_inbox(pg_temp.id('academy'), null, null, 2)->>'hasMore')::boolean, 'paging reports more');
select pg_temp.check(jsonb_array_length(public.notification_inbox(pg_temp.id('academy'),
  (public.notification_inbox(pg_temp.id('academy'), null, null, 2)->'items'->1->>'createdAt')::timestamptz,
  (public.notification_inbox(pg_temp.id('academy'), null, null, 2)->'items'->1->>'id')::uuid)->'items') = 3, 'keyset next page');
reset role;
-- Marking another person's notification ids changes nothing.
create temporary table others as select id from public.notifications where recipient_id = pg_temp.id('mutee');
grant select on pg_temp.others to authenticated;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error($$select count(*) from public.notifications$$, 'permission denied%');
select pg_temp.check((public.mark_notifications_read(pg_temp.id('academy'), array(select id from pg_temp.others))->>'marked')::int = 0, 'cannot mark others');
reset role;
select pg_temp.act('member');
set local role authenticated;
select public.mark_notifications_read(pg_temp.id('academy'), array[(select (public.notification_inbox(pg_temp.id('academy'))->'items'->0->>'id')::uuid)]);
reset role;
select pg_temp.check((select count(*) from public.notifications where recipient_id = pg_temp.id('mutee') and read_at is not null) = 0, 'marking is per recipient');
select pg_temp.act('mutee');
set local role authenticated;
select pg_temp.expect_error($$select public.mark_notifications_read(pg_temp.id('academy'), array_fill(gen_random_uuid(), array[101]))$$, 'validation');
-- Reading the conversation reads its message notifications.
select public.mark_concern_read(pg_temp.id('academy'),pg_temp.id('thread'),4);
reset role;
select pg_temp.check((select count(*) from public.notifications where recipient_id = pg_temp.id('mutee') and kind in ('concern_message','concern_mention') and read_at is null) = 0, 'conversation read clears message notifications');
select pg_temp.check((select read_at is null from public.notifications where recipient_id = pg_temp.id('mutee') and kind = 'concern_added'), 'lifecycle alerts stay unread');

-- Claim judges current state: deleted (m3) and read (mutee) work is skipped; focus suppresses only ordinary messages.
select pg_temp.act('member');
set local role authenticated;
select public.set_concern_focus(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('tab'));
reset role;
create temporary table claimed as select x, o from jsonb_array_elements(pg_temp.claim()) with ordinality e(x, o);
grant select on pg_temp.claimed to service_role;
select pg_temp.check(not exists (select 1 from claimed where x->'notification'->>'messageId' = pg_temp.id('m3')::text), 'deleted message not pushed');
select pg_temp.check(not exists (select 1 from claimed where x->'notification'->>'kind' = 'concern_message'), 'focused concern suppresses ordinary push');
select pg_temp.check(exists (select 1 from claimed where x->'notification'->>'kind' = 'concern_mention' and x->>'endpoint' = pg_temp.endpoint('member')), 'mention pushed despite focus');
select pg_temp.check(not exists (select 1 from claimed where x->>'endpoint' = pg_temp.endpoint('mutee') and x->'notification'->>'kind' <> 'concern_added'), 'read notifications not pushed');
select pg_temp.check((select bool_and(x->>'academySlug' = 'concern-notify-' || pg_temp.id('academy') and x->>'p256dh' = pg_temp.p256dh()) from claimed), 'claim payload');
select pg_temp.check(jsonb_array_length(pg_temp.claim()) = 0, 'leased deliveries are not claimed twice');
select pg_temp.check((select count(*) from public.notification_deliveries where state = 'skipped') >= 3, 'undeliverable work finished as skipped');

-- Outcomes: sent; retry with backoff; failure isolation leaves the concern untouched.
select pg_temp.check((select count(*) from public.concern_messages where concern_id = pg_temp.id('thread')) = 4, 'messages before outcomes');
set local role service_role;
select public.complete_notification_delivery((select (x->>'deliveryId')::uuid from claimed where o = 1), 'sent', 201);
select public.complete_notification_delivery((select (x->>'deliveryId')::uuid from claimed where o = 2), 'retry', 503, 120);
select public.complete_notification_delivery(gen_random_uuid(), 'sent', 201); -- unknown id: no-op
reset role;
select pg_temp.check((select state from public.notification_deliveries where id = (select (x->>'deliveryId')::uuid from claimed where o = 1)) = 'sent', 'sent recorded');
select pg_temp.check((select state = 'pending' and lease_until is null and next_attempt_at > clock_timestamp() + interval '100 seconds'
  from public.notification_deliveries where id = (select (x->>'deliveryId')::uuid from claimed where o = 2)), 'retry honours Retry-After');
select pg_temp.check((select last_success_at is not null from public.push_subscriptions where endpoint = (select x->>'endpoint' from claimed where o = 1)), 'success recorded');
select pg_temp.check((select count(*) from public.concern_messages where concern_id = pg_temp.id('thread')) = 4, 'delivery outcomes never touch the concern');

-- Focus expires after its TTL and can be cleared; then ordinary messages push again.
select pg_temp.send('admin','m5','Fifth');
update edra_private.concern_focus set seen_at = clock_timestamp() - interval '46 seconds' where user_id = pg_temp.id('member');
select pg_temp.check(exists (select 1 from jsonb_array_elements(pg_temp.claim()) x where x->'notification'->>'messageId' = pg_temp.id('m5')::text), 'stale focus does not suppress');
select pg_temp.act('member');
set local role authenticated;
select public.set_concern_focus(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('tab2'));
select public.set_concern_focus(pg_temp.id('academy'),null,pg_temp.id('tab2'));
reset role;
select pg_temp.check(not exists (select 1 from edra_private.concern_focus where client_id = pg_temp.id('tab2')), 'focus cleared');

-- Lifecycle: every other current participant; Owner recovery notifies nobody.
select pg_temp.act('owner');
set local role authenticated;
select public.recover_concern(pg_temp.id('academy'),pg_temp.id('thread'),gen_random_uuid());
reset role;
select pg_temp.check(not exists (select 1 from public.notifications n join public.concern_events e on e.id = n.event_id where e.kind = 'owner_recovered'), 'recovery notifies nobody');
select pg_temp.act('admin');
set local role authenticated;
select public.settle_concern(pg_temp.id('academy'),pg_temp.id('thread'),'Resolved',1,gen_random_uuid());
reset role;
select pg_temp.check(pg_temp.notified('member','concern_settled') = 1 and pg_temp.notified('mutee','concern_settled') = 1 and pg_temp.notified('owner','concern_settled') = 1
  and pg_temp.notified('admin','concern_settled') = 0, 'settlement notifies other participants');
select pg_temp.act('mutee');
set local role authenticated;
select public.set_concern_muted(pg_temp.id('academy'),pg_temp.id('thread'),false); -- allowed while settled
reset role;
select pg_temp.act('owner');
set local role authenticated;
select public.reopen_concern(pg_temp.id('academy'),pg_temp.id('thread'),'New evidence',2,gen_random_uuid());
reset role;
select pg_temp.check(pg_temp.notified('admin','concern_reopened') = 1 and pg_temp.notified('owner','concern_reopened') = 0, 'reopening notifies others');

-- Membership: additions notify the added person; removal/suspension stops delivery and reads.
select pg_temp.act('admin');
set local role authenticated;
select public.add_concern_participants(pg_temp.id('academy'),pg_temp.id('thread'),array[pg_temp.id('spare')],gen_random_uuid());
select public.remove_concern_participant(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('member'),gen_random_uuid());
reset role;
select pg_temp.check(pg_temp.notified('spare','concern_added') = 1, 'addition notifies the added person');
select pg_temp.check(not exists (select 1 from public.notifications n join public.concern_events e on e.id = n.event_id where e.kind = 'participant_removed'), 'removal notifies nobody');
select pg_temp.send('admin','m6','After removal');
select pg_temp.check(pg_temp.notified('member','concern_message','m6') = 0, 'removed participant receives nothing new');
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check(jsonb_array_length(public.notification_inbox(pg_temp.id('academy'))->'items') = 0, 'removed participant reads no notifications');
select pg_temp.check((public.notification_unread(pg_temp.id('academy'))->>'count')::int = 0, 'removed participant counts nothing');
select pg_temp.expect_error($$select public.set_concern_focus(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('tab'))$$, 'forbidden');
reset role;
-- A delivery queued before revocation is skipped at claim time.
select pg_temp.send('admin','m7','Before suspension');
update public.academy_memberships set suspended_at = now() where academy_id = pg_temp.id('academy') and user_id = pg_temp.id('mutee');
select pg_temp.check(not exists (select 1 from jsonb_array_elements(pg_temp.claim()) x where x->>'endpoint' = pg_temp.endpoint('mutee')), 'suspended recipient not pushed');
select pg_temp.send('admin','m8','After suspension');
select pg_temp.check(pg_temp.notified('mutee','concern_message','m8') = 0, 'suspended participant receives nothing new');
select pg_temp.act('mutee');
set local role authenticated;
select pg_temp.expect_error($$select public.notification_unread(pg_temp.id('academy'))$$, 'forbidden');
reset role;

-- Possession transfer: the same keys move an endpoint and drop the previous account's queue.
select pg_temp.act('spare');
set local role authenticated;
select public.register_push_subscription(pg_temp.endpoint('member'), pg_temp.p256dh(), pg_temp.auth());
reset role;
select pg_temp.check((select user_id from public.push_subscriptions where endpoint = pg_temp.endpoint('member')) = pg_temp.id('spare'), 'endpoint transferred');
select pg_temp.check(not exists (select 1 from public.notification_deliveries d join public.push_subscriptions s on s.id = d.subscription_id
  join public.notifications n on n.id = d.notification_id where s.endpoint = pg_temp.endpoint('member') and n.recipient_id <> pg_temp.id('spare')), 'previous account queue dropped');

-- Gone deletes the subscription; retries stop at five attempts; expired work is skipped.
insert into nt_ids(name) values ('m9');
select pg_temp.send('owner','m9','For spare');
update public.notification_deliveries set attempts = 5 where notification_id in (select id from public.notifications where message_id = pg_temp.id('m9'));
select pg_temp.check(jsonb_array_length(pg_temp.claim()) = 0 and (select bool_and(state = 'failed') from public.notification_deliveries
  where notification_id in (select id from public.notifications where message_id = pg_temp.id('m9'))), 'attempt limit fails delivery');
insert into nt_ids(name) values ('m10');
select pg_temp.send('owner','m10','Expiring');
update public.notification_deliveries set expires_at = clock_timestamp() - interval '1 second' where notification_id in (select id from public.notifications where message_id = pg_temp.id('m10'));
select pg_temp.check(jsonb_array_length(pg_temp.claim()) = 0 and (select bool_and(state = 'skipped') from public.notification_deliveries
  where notification_id in (select id from public.notifications where message_id = pg_temp.id('m10'))), 'expired delivery skipped');
insert into nt_ids(name) values ('m11');
select pg_temp.send('owner','m11','Gone');
create temporary table gone as select x from jsonb_array_elements(pg_temp.claim()) x;
grant select on pg_temp.gone to service_role;
select pg_temp.check((select count(*) from gone) = 1, 'one live delivery for the spare browser');
set local role service_role;
select public.complete_notification_delivery((select (x->>'deliveryId')::uuid from gone), 'gone', 410);
reset role;
select pg_temp.check(not exists (select 1 from public.push_subscriptions where endpoint = pg_temp.endpoint('member')), 'gone endpoint deleted');

-- Release by possession and global sign-out cleanup.
select pg_temp.act('outsider');
set local role authenticated;
select public.release_push_subscription(pg_temp.endpoint('mutee'), 'AAAAAAAAAAAAAAAAAAAAAA'); -- wrong secret: nothing
reset role;
select pg_temp.check(exists (select 1 from public.push_subscriptions where endpoint = pg_temp.endpoint('mutee')), 'release needs possession');
select pg_temp.act('mutee');
set local role authenticated;
select public.forget_push_subscriptions();
reset role;
select pg_temp.check(not exists (select 1 from public.push_subscriptions where user_id = pg_temp.id('mutee')), 'sign-out forgets subscriptions');

-- Cross-academy isolation: another academy's concern never notifies this academy's people.
select pg_temp.act('outsider');
set local role authenticated;
select public.create_concern(pg_temp.id('other'),pg_temp.id('foreign'),pg_temp.id('f1'),'Elsewhere','Opening','{}');
select pg_temp.check(jsonb_array_length(public.notification_inbox(pg_temp.id('other'))->'items') = 0, 'creator has no self alerts');
reset role;
select pg_temp.check(not exists (select 1 from public.notifications where concern_id = pg_temp.id('foreign')), 'no cross-academy recipients');

select edra_private.prune_notification_state();
rollback;
