-- Concern messaging: grants, creation, participant-only reads/writes, cross-academy denial,
-- idempotent sends, stable paging and change recovery, the five-minute edit boundary, deletion
-- tombstones in replies/search, reactions, mentions, monotonic receipts, unread, settled
-- read-only behavior, suspension/removal/rejoin and channel authorization. All fixtures roll back.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Concern messaging check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table cm_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into cm_ids(name) values ('owner'),('admin'),('member'),('spare'),('outsider'),('academy'),('other'),
  ('thread'),('team'),('m1'),('m2'),('m3'),('m4'),('m5'),('m6'),('t1'),('late');
grant select on pg_temp.cm_ids to authenticated;
create temporary table cm_vals(name text primary key, v jsonb not null);
grant select, insert on pg_temp.cm_vals to authenticated;
create function pg_temp.val(label text) returns jsonb language sql as $$ select v from pg_temp.cm_vals where name=label $$;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.cm_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(label)::text,''), true)
$$;
create function pg_temp.q(label text) returns text language sql as $$ select quote_literal(pg_temp.id(label)) $$;

do $$ begin
  if has_table_privilege('authenticated','public.concern_messages','insert')
    or has_table_privilege('authenticated','public.concern_messages','update')
    or has_table_privilege('authenticated','public.concern_reactions','insert')
    or has_table_privilege('anon','public.concern_messages','select')
    or not has_table_privilege('authenticated','public.concern_messages','select')
    or has_sequence_privilege('authenticated','public.concern_revision_seq','usage')
    or has_function_privilege('anon','public.send_concern_message(uuid,uuid,uuid,text,uuid,uuid[],uuid[])','execute')
    or not has_function_privilege('authenticated','public.send_concern_message(uuid,uuid,uuid,text,uuid,uuid[],uuid[])','execute')
    or has_function_privilege('anon','public.create_concern(uuid,uuid,uuid,text,text,uuid[],boolean,uuid[])','execute')
    or has_function_privilege('authenticated','edra_private.post_concern_message(public.concerns,uuid,text,uuid,uuid[])','execute')
    or has_function_privilege('authenticated','edra_private.my_concerns(uuid)','execute') then
    raise exception 'Concern messaging check failed: grants';
  end if;
end $$;

insert into auth.users(id) select id from cm_ids where name in ('owner','admin','member','spare','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Messaging fixture','concern-msg-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other messaging','concern-msg-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('member'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('spare'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));

-- Creation ----------------------------------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.create_concern(%s,%s,%s,''T'',''Hi'',''{}'')',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'forbidden');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error(format('select public.create_concern(%s,%s,%s,''T'',''Hi'',''{}'')',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'forbidden');
reset role;

select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.create_concern(%s,%s,%s,''T'',''Hi'',array[%s]::uuid[])',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1'),pg_temp.q('outsider')), 'invalid_participant');
select pg_temp.expect_error(format('select public.create_concern(%s,%s,%s,''  '',''Hi'',''{}'')',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'validation');
select pg_temp.expect_error(format('select public.create_concern(%s,%s,%s,''T'',''Hi'',array[%s]::uuid[],false,array[%s]::uuid[])',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1'),pg_temp.q('member'),pg_temp.q('spare')), 'invalid_mention');
insert into cm_vals select 'created', public.create_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m1'),
  'Late homework','Hello @member https://example.com/x',array[pg_temp.id('member')],false,array[pg_temp.id('member')]) r;
select pg_temp.check((pg_temp.val('created')->'message'->>'seq')::int = 1
  and pg_temp.val('created')->'message'->'mentions' = jsonb_build_array(pg_temp.id('member')), 'opening message is seq 1 with its mention');
-- A retried creation returns the same concern and message without duplicating anything.
select pg_temp.check((public.create_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m1'),
  'Late homework','Hello @member https://example.com/x',array[pg_temp.id('member')])->'message'->>'id')::uuid = pg_temp.id('m1'),
  'creation retry is idempotent');
reset role;
select pg_temp.check((select count(*) from public.concern_participants where concern_id=pg_temp.id('thread'))=2,
  'creator and selected member only; Owner not implicit');
select pg_temp.check((select array_agg(kind order by occurred_at, id) from public.concern_events where concern_id=pg_temp.id('thread'))
  = array['created','participant_added','participant_added','message_sent'], 'atomic durable creation events');
select pg_temp.check((select detail->'mentions' from public.concern_events where concern_id=pg_temp.id('thread') and kind='message_sent')
  = jsonb_build_array(pg_temp.id('member')), 'mention recorded for notification integration');

-- Whole team captures current active staff only.
update public.academy_memberships set suspended_at=clock_timestamp() where user_id=pg_temp.id('spare');
select pg_temp.act('admin');
select public.create_concern(pg_temp.id('academy'),pg_temp.id('team'),pg_temp.id('t1'),'Team','All hands','{}',true);
update public.academy_memberships set suspended_at=null where user_id=pg_temp.id('spare');
select pg_temp.check((select array_agg(user_id order by user_id) from public.concern_participants where concern_id=pg_temp.id('team'))
  = (select array_agg(id order by id) from cm_ids where name in ('owner','admin','member')), 'whole-team snapshot excludes suspended');

-- Participant-only access -------------------------------------------------------------------------
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2')), 'forbidden');
select pg_temp.expect_error(format('select public.concern_messages_page(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.expect_error(format('select public.concern_detail(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'homework'))=0, 'nonparticipant search empty');
select pg_temp.check(not exists (select 1 from jsonb_array_elements(public.concern_inbox(pg_temp.id('academy'))->'concerns') c
  where (c->>'id')::uuid=pg_temp.id('thread')), 'nonparticipant inbox excludes thread');
select pg_temp.check((select count(*) from public.concern_messages where concern_id=pg_temp.id('thread'))=0, 'nonparticipant RLS read');
select pg_temp.check(not public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')), 'nonparticipant channel');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_message_changes(%s,%s,0)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.expect_error(format('select public.mark_concern_read(%s,%s,1)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check((public.concern_unread(pg_temp.id('academy'))->>'messages')::int=0, 'cross academy unread empty');
select pg_temp.check(not public.can_join_concern_channel('concern-inbox:'||pg_temp.id('member')||':'||pg_temp.id('academy')), 'another user inbox topic');
select pg_temp.check(not public.can_join_concern_channel('concern-inbox:'||pg_temp.id('outsider')||':'||pg_temp.id('academy')), 'foreign academy inbox topic');
reset role;

-- Sending, replies, retries ------------------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check(public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')), 'participant channel');
select pg_temp.check(public.can_join_concern_channel('concern-inbox:'||pg_temp.id('member')||':'||pg_temp.id('academy')), 'own inbox topic');
select pg_temp.check((public.concern_unread(pg_temp.id('academy'))->>'mentions')::int=1, 'unread mention counted');
select pg_temp.check((public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),'Reply',pg_temp.id('m1'))->>'seq')::int=2, 'reply is seq 2');
select pg_temp.check((public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),'Reply',pg_temp.id('m1'))->>'seq')::int=2, 'send retry returns original');
select pg_temp.check((select (c->>'unread')::int=0 and (c->>'lastReadSeq')::int=2 from jsonb_array_elements(public.concern_inbox(pg_temp.id('academy'))->'concerns') c
  where (c->>'id')::uuid=pg_temp.id('thread')), 'own send marks read');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('team'),pg_temp.q('m2')), 'conflict');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'',null,array[%s]::uuid[])',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3'),pg_temp.q('owner')), 'invalid_mention');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''   '')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3')), 'validation');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'',%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3'),pg_temp.q('t1')), 'reply_unavailable');
select public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),'Third');
select public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m4'),'Fourth');
select public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m5'),'Fifth searchable');
reset role;
select pg_temp.check((select count(*) from public.concern_messages where concern_id=pg_temp.id('thread'))=5
  and (select count(*) from public.concern_events where concern_id=pg_temp.id('thread') and kind='message_sent')=5, 'no duplicates');

-- Paging and change recovery ------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
insert into cm_vals select 'page', public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'),null,2);
select pg_temp.check(array(select (e->>'seq')::int from jsonb_array_elements(pg_temp.val('page')->'messages') e) = array[4,5]
  and (pg_temp.val('page')->>'hasMore')::boolean, 'latest page ascending with more');
select pg_temp.check((select array(select (e->>'seq')::int from jsonb_array_elements(r->'messages') e)
  from (select public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'),4,10) r) x) = array[1,2,3], 'older page');
select pg_temp.check((select (r->'messages'->0->'replyTo'->>'body') is null from (select public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'),3,1) r) x) = false,
  'reply preview shows live text');
select pg_temp.check(jsonb_array_length(public.concern_message_changes(pg_temp.id('academy'),pg_temp.id('thread'),(pg_temp.val('page')->>'cursor')::bigint)->'messages')=0,
  'nothing newer than the cursor');
select pg_temp.check((select r->'concerns'->0->>'unread' from (select public.concern_inbox(pg_temp.id('academy'),'ongoing') r) x)::int >= 0, 'inbox status filter');
reset role;

-- Editing: author only, five-minute boundary by the database clock --------------------------------
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.edit_concern_message(%s,%s,%s,''hijack'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3')), 'forbidden');
reset role;
update public.concern_messages set created_at=clock_timestamp()-interval '290 seconds' where id=pg_temp.id('m3');
update public.concern_messages set created_at=clock_timestamp()-interval '301 seconds' where id=pg_temp.id('m4');
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check((public.edit_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),'Third, edited')->>'editedAt') is not null, 'edit inside window');
select pg_temp.expect_error(format('select public.edit_concern_message(%s,%s,%s,''late'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m4')), 'edit_expired');
select pg_temp.check((select r->'messages' from (select public.concern_message_changes(pg_temp.id('academy'),pg_temp.id('thread'),(pg_temp.val('page')->>'cursor')::bigint) r) x)
  @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('m3'), 'body', 'Third, edited')), 'edit recovered through changes');
reset role;
select pg_temp.check((select array_agg(kind order by occurred_at) from public.concern_events where subject_id=pg_temp.id('m3')) = array['message_sent','message_edited'], 'edit event');

-- Reactions -----------------------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
select public.set_concern_reaction(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),'👍',true);
select pg_temp.check((public.set_concern_reaction(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),'👍',true)->'reactions')
  = jsonb_build_array(jsonb_build_object('emoji','👍','userIds',jsonb_build_array(pg_temp.id('admin')))), 'reaction repeat is idempotent');
select pg_temp.expect_error(format('select public.set_concern_reaction(%s,%s,%s,''a b'',true)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2')), 'validation');
reset role;

-- Deletion tombstones -------------------------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.delete_concern_message(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'forbidden');
select public.delete_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'));
select pg_temp.check((public.delete_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'))->>'deletedAt') is not null, 'delete retry');
select public.delete_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m4')); -- anytime, past the edit window
reset role;
select pg_temp.check((select body is null and mentions='{}' and deleted_at is not null from public.concern_messages where id=pg_temp.id('m2')), 'text removed');
select pg_temp.check(not exists (select 1 from public.concern_reactions where message_id=pg_temp.id('m2')), 'reactions removed');
select pg_temp.act('admin');
set local role authenticated;
select public.delete_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m1'));
select pg_temp.check((select e->'replyTo' from jsonb_array_elements(public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'))->'messages') e
  where (e->>'id')::uuid=pg_temp.id('m2')) @> jsonb_build_object('id',pg_temp.id('m1'),'seq',1,'body',null,'deleted',true),
  'reply stays attached to a placeholder without text');
select pg_temp.check(not (public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'))::text like '%example.com%'), 'deleted text absent from pages');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'example.com'))=0, 'deleted text absent from search');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'searchable'))=1, 'live text searchable');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'homework'))=1, 'title searchable');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'%%'))=0, 'wildcards are literal');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'',%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m6'),pg_temp.q('m1')), 'reply_unavailable');
select pg_temp.expect_error(format('select public.set_concern_reaction(%s,%s,%s,''👍'',true)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'message_deleted');
select pg_temp.expect_error(format('select public.edit_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'message_deleted');
reset role;

-- Receipts and unread -------------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check((public.concern_unread(pg_temp.id('academy'))->>'messages')::int=2, 'admin unread excludes deleted and own');
select pg_temp.check((public.mark_concern_read(pg_temp.id('academy'),pg_temp.id('thread'),3)->>'lastReadSeq')::int=3, 'read forward');
select pg_temp.check((public.mark_concern_read(pg_temp.id('academy'),pg_temp.id('thread'),1)->>'lastReadSeq')::int=3, 'read never moves back');
select pg_temp.check((public.mark_concern_read(pg_temp.id('academy'),pg_temp.id('thread'),999)->>'lastReadSeq')::int=5, 'read clamps to last message');
select pg_temp.check((select (p->>'lastReadSeq')::int=5 and p->>'readAt' is not null from jsonb_array_elements(public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->'participants') p
  where (p->>'userId')::uuid=pg_temp.id('admin')), 'receipt visible to participants');
reset role;

-- Settled concerns are read-only, except read state and retries of completed sends -----------------
update public.concerns set status='settled', settled_at=clock_timestamp(), settled_by=pg_temp.id('admin'), outcome='Done' where id=pg_temp.id('thread');
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m6')), 'concern_settled');
select pg_temp.expect_error(format('select public.edit_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m5')), 'concern_settled');
select pg_temp.expect_error(format('select public.delete_concern_message(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m5')), 'concern_settled');
select pg_temp.expect_error(format('select public.set_concern_reaction(%s,%s,%s,''👍'',true)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m5')), 'concern_settled');
select pg_temp.check((public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m5'),'Fifth searchable')->>'seq')::int=5, 'completed send retry after settle');
select pg_temp.check((public.mark_concern_read(pg_temp.id('academy'),pg_temp.id('thread'),5)->>'lastReadSeq')::int=5, 'receipts allowed when settled');
reset role;
update public.concerns set status='ongoing', settled_at=null, settled_by=null, outcome=null where id=pg_temp.id('thread');

-- Suspension, removal and rejoin stop all reads ---------------------------------------------------
update public.academy_memberships set suspended_at=clock_timestamp() where user_id=pg_temp.id('member') and academy_id=pg_temp.id('academy');
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_messages_page(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check(not public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')), 'suspended channel');
select pg_temp.check(not public.can_join_concern_channel('concern-inbox:'||pg_temp.id('member')||':'||pg_temp.id('academy')), 'suspended inbox');
reset role;
update public.academy_memberships set suspended_at=null where user_id=pg_temp.id('member') and academy_id=pg_temp.id('academy');
update public.concern_participants set removed_at=clock_timestamp(), removed_by=pg_temp.id('admin') where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_message_changes(%s,%s,0)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'searchable'))=0, 'removed search empty');
reset role;
update public.concern_participants set removed_at=null, removed_by=null where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('member');
update public.academy_memberships set created_at=created_at+interval '1 second' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.mark_concern_read(%s,%s,1)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check((public.concern_unread(pg_temp.id('academy'))->>'messages')::int=0, 'rejoined staff do not inherit unread');
reset role;
-- The creator remains an academy manager but loses concern participation: creation retries cannot read.
update public.concern_participants set removed_at=clock_timestamp(), removed_by=pg_temp.id('owner')
  where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('admin');
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.create_concern(%s,%s,%s,''Retry'',''Retry'',''{}'')',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'forbidden');
reset role;
rollback;
