-- Concern authority and lifecycle: participant add/remove/readd, settlement/reopening with history,
-- stale/idempotent retries, Owner-only audited recovery, role changes, rejoin identity, settled
-- read-only behavior and server-attributed typing. CI runs this only on its disposable database.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Concern lifecycle check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table cl_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into cl_ids(name) values ('owner'),('head'),('admin'),('member'),('spare'),('idle'),('outsider'),('academy'),('other'),
  ('thread'),('foreign'),('m1'),('m2'),('m3'),('f1'),('r1'),('r2'),('r3'),('r4'),('r5'),('r6'),('r7'),('r8'),('r9'),('r10'),('r11');
grant select on pg_temp.cl_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.cl_ids where name=label $$;
create function pg_temp.q(label text) returns text language sql as $$ select quote_literal(pg_temp.id(label)) $$;
create function pg_temp.act(label text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(label)::text,''), true)
$$;
create function pg_temp.kinds() returns text[] language sql as $$
  select array_agg(kind order by occurred_at, id) from public.concern_events
  where concern_id = pg_temp.id('thread') and kind not like 'message_%'
$$;
create function pg_temp.version() returns bigint language sql as $$ select version from public.concerns where id = pg_temp.id('thread') $$;

do $$ begin
  if has_function_privilege('anon','public.settle_concern(uuid,uuid,text,bigint,uuid)','execute')
    or has_function_privilege('anon','public.recover_concern(uuid,uuid,uuid)','execute')
    or has_function_privilege('anon','public.set_concern_typing(uuid,uuid,boolean)','execute')
    or not has_function_privilege('authenticated','public.add_concern_participants(uuid,uuid,uuid[],uuid)','execute')
    or not has_function_privilege('authenticated','public.remove_concern_participant(uuid,uuid,uuid,uuid)','execute')
    or not has_function_privilege('authenticated','public.reopen_concern(uuid,uuid,text,bigint,uuid)','execute')
    or not has_function_privilege('authenticated','public.concern_history(uuid,uuid)','execute')
    or has_function_privilege('authenticated','edra_private.concern_replayed(uuid,uuid,text[],jsonb)','execute')
    or has_function_privilege('authenticated','edra_private.require_concern_manager(uuid)','execute')
    or has_table_privilege('authenticated','public.concern_participants','insert')
    or has_table_privilege('authenticated','public.concern_events','update') then
    raise exception 'Concern lifecycle check failed: grants';
  end if;
  -- Clients may no longer publish presence on concern topics; typing is attributed by the database.
  if exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='concern_channel_presence')
    or exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='concern_channel_receive'
      and qual like '%presence%') then
    raise exception 'Concern lifecycle check failed: presence policies withdrawn';
  end if;
end $$;

insert into auth.users(id) select id from cl_ids where name in ('owner','head','admin','member','spare','idle','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Lifecycle fixture','concern-life-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other lifecycle','concern-life-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('head'),'head_admin',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('member'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('spare'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('idle'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));

select pg_temp.act('admin');
set local role authenticated;
select public.create_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m1'),'Exam leak','Opening history',array[pg_temp.id('member')]);
select public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),'Second');
select pg_temp.check((public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->>'canManage')::boolean
  and (public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->>'version')::int = 1, 'manager detail capability and version');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select public.create_concern(pg_temp.id('other'),pg_temp.id('foreign'),pg_temp.id('f1'),'Elsewhere','Other academy','{}');
reset role;

-- Participant management authority ----------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check(not (public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->>'canManage')::boolean, 'instructor cannot manage');
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('spare'),pg_temp.q('r1')), 'not_permitted');
select pg_temp.expect_error(format('select public.remove_concern_participant(%s,%s,%s,%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('admin'),pg_temp.q('r1')), 'not_permitted');
select pg_temp.expect_error(format('select public.settle_concern(%s,%s,''Done'',1,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r1')), 'not_permitted');
reset role;
-- Leadership outside the concern has no bypass, including Head Admins.
select pg_temp.act('head');
set local role authenticated;
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('head'),pg_temp.q('r1')), 'forbidden');
select pg_temp.expect_error(format('select public.settle_concern(%s,%s,''Done'',1,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r1')), 'forbidden');
select pg_temp.expect_error(format('select public.concern_history(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('outsider'),pg_temp.q('r1')), 'forbidden');
reset role;

select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('outsider'),pg_temp.q('r1')), 'invalid_participant');
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,''{}'',%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r1')), 'validation');
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],null)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('spare')), 'validation');
reset role;
update public.academy_memberships set suspended_at=clock_timestamp() where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('idle');
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('idle'),pg_temp.q('r1')), 'invalid_participant');
-- Adding an existing participant with another new staff member records only the new one.
select public.add_concern_participants(pg_temp.id('academy'),pg_temp.id('thread'),array[pg_temp.id('spare'),pg_temp.id('member')],pg_temp.id('r1'));
select public.add_concern_participants(pg_temp.id('academy'),pg_temp.id('thread'),array[pg_temp.id('spare'),pg_temp.id('member')],pg_temp.id('r1'));
reset role;
update public.academy_memberships set suspended_at=null where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('idle');
select pg_temp.check((select count(*) from public.concern_events where concern_id=pg_temp.id('thread') and kind='participant_added'
  and subject_id=pg_temp.id('spare'))=1, 'add retry records once');
select pg_temp.check((select count(*) from public.concern_events where concern_id=pg_temp.id('thread') and kind='participant_added'
  and subject_id=pg_temp.id('member'))=1, 'existing participant not re-added');
select pg_temp.check((select added_by=pg_temp.id('admin') from public.concern_participants where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('spare')),
  'addition attributed');
select pg_temp.check(not exists (select 1 from public.concern_participants where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('idle')),
  'future and inactive staff never auto-enrolled');

-- Added staff read the full history.
select pg_temp.act('spare');
set local role authenticated;
select pg_temp.check(array(select (e->>'seq')::int from jsonb_array_elements(public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'))->'messages') e) = array[1,2],
  'new participant sees full history');
select pg_temp.check(public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')), 'new participant channel');
select pg_temp.expect_error(format('select public.mark_concern_read(%s,%s,2)',pg_temp.q('academy'),pg_temp.q('foreign')), 'forbidden');
reset role;

-- Removal ends every authorized read --------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
-- A request id belongs to its first actor and command.
select pg_temp.expect_error(format('select public.remove_concern_participant(%s,%s,%s,%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('spare'),pg_temp.q('r1')), 'conflict');
select public.remove_concern_participant(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('spare'),pg_temp.id('r2'));
select public.remove_concern_participant(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('spare'),pg_temp.id('r2'));
select pg_temp.check(not exists (select 1 from jsonb_array_elements(public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->'participants') p
  where (p->>'userId')::uuid=pg_temp.id('spare')), 'removed participant not listed');
reset role;
select pg_temp.check((select count(*) from public.concern_events where concern_id=pg_temp.id('thread') and kind='participant_removed')=1, 'removal retry records once');
select pg_temp.check((select removed_by=pg_temp.id('admin') and removed_at is not null from public.concern_participants
  where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('spare')), 'removal attributed, row kept');
select pg_temp.act('spare');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_messages_page(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.expect_error(format('select public.concern_history(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.expect_error(format('select public.mark_concern_read(%s,%s,2)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3')), 'forbidden');
select pg_temp.expect_error(format('select public.set_concern_typing(%s,%s,true)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'history'))=0, 'removed search empty');
select pg_temp.check(not public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')), 'removed channel denied');
reset role;

-- Readdition is explicit and captures the current academy membership identity.
update public.academy_memberships set created_at=created_at+interval '1 second' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('spare');
select pg_temp.act('admin');
set local role authenticated;
select public.add_concern_participants(pg_temp.id('academy'),pg_temp.id('thread'),array[pg_temp.id('spare')],pg_temp.id('r3'));
reset role;
select pg_temp.check((select membership_created_at = (select created_at from public.academy_memberships where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('spare'))
  and removed_at is null and removed_by is null from public.concern_participants where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('spare')), 'readd captures identity');
select pg_temp.check((select (detail->>'readded')::boolean from public.concern_events where concern_id=pg_temp.id('thread') and detail->>'requestId'=pg_temp.id('r3')::text),
  'readd recorded as such');
select pg_temp.act('spare');
set local role authenticated;
select pg_temp.check(jsonb_array_length(public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'))->'messages')=2, 'readded reads again');
reset role;
-- Rejoining the academy alone never restores participation.
update public.academy_memberships set created_at=created_at+interval '1 second' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('spare');
select pg_temp.act('spare');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_detail(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
reset role;
-- Suspension denies while it lasts.
update public.academy_memberships set suspended_at=clock_timestamp() where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('member');
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.set_concern_typing(%s,%s,true)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.expect_error(format('select public.concern_history(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
reset role;
update public.academy_memberships set suspended_at=null where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('member');

-- Typing is attributed by the database ------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
select public.set_concern_typing(pg_temp.id('academy'),pg_temp.id('thread'),true);
select pg_temp.expect_error(format('select public.set_concern_typing(%s,%s,null)',pg_temp.q('academy'),pg_temp.q('thread')), 'validation');
reset role;
select pg_temp.check(exists (select 1 from realtime.messages where topic='concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')||':'||pg_temp.id('admin')
  and event='typing' and payload->>'userId'=pg_temp.id('member')::text), 'typing names the caller on an authorized personal topic');
select pg_temp.check(not exists (select 1 from realtime.messages where topic='concern:'||pg_temp.id('academy')||':'||pg_temp.id('thread')
  and event='typing'), 'no typing identity broadcast to a shared topic');

-- Settlement -------------------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.settle_concern(%s,%s,''   '',1,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r4')), 'validation');
select pg_temp.expect_error(format('select public.settle_concern(%s,%s,''Done'',7,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r4')), 'stale');
select pg_temp.check((public.settle_concern(pg_temp.id('academy'),pg_temp.id('thread'),' First outcome ',1,pg_temp.id('r4'))->>'version')::int=2, 'settled at version 2');
select pg_temp.check((public.settle_concern(pg_temp.id('academy'),pg_temp.id('thread'),' First outcome ',1,pg_temp.id('r4'))->>'status')='settled', 'settle retry succeeds');
select pg_temp.expect_error(format('select public.settle_concern(%s,%s,''Again'',2,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r5')), 'concern_settled');
select pg_temp.check((select d->>'outcome'='First outcome' and (d->>'settledBy')::uuid=pg_temp.id('admin') and d->>'settledAt' is not null
  from (select public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread')) d) x), 'outcome and attribution in detail');
-- Read-only, except reading and mandatory receipts.
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3')), 'concern_settled');
select pg_temp.expect_error(format('select public.set_concern_reaction(%s,%s,%s,''👍'',true)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m1')), 'concern_settled');
select pg_temp.expect_error(format('select public.add_concern_participants(%s,%s,array[%s]::uuid[],%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('idle'),pg_temp.q('r5')), 'concern_settled');
select pg_temp.expect_error(format('select public.remove_concern_participant(%s,%s,%s,%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('member'),pg_temp.q('r5')), 'concern_settled');
select pg_temp.expect_error(format('select public.set_concern_typing(%s,%s,true)',pg_temp.q('academy'),pg_temp.q('thread')), 'concern_settled');
select public.set_concern_typing(pg_temp.id('academy'),pg_temp.id('thread'),false);
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check((public.mark_concern_read(pg_temp.id('academy'),pg_temp.id('thread'),2)->>'lastReadSeq')::int=2, 'receipts allowed when settled');
select pg_temp.expect_error(format('select public.reopen_concern(%s,%s,''Why'',2,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r5')), 'not_permitted');
reset role;

-- Reopening ---------------------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.reopen_concern(%s,%s,'''',2,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r5')), 'validation');
select pg_temp.expect_error(format('select public.reopen_concern(%s,%s,''Why'',1,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r5')), 'stale');
select pg_temp.expect_error(format('select public.reopen_concern(%s,%s,''Why'',2,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r4')), 'conflict');
select public.reopen_concern(pg_temp.id('academy'),pg_temp.id('thread'),'New evidence',2,pg_temp.id('r5'));
select pg_temp.check((public.reopen_concern(pg_temp.id('academy'),pg_temp.id('thread'),'New evidence',2,pg_temp.id('r5'))->>'version')::int=3, 'reopen retry');
select pg_temp.expect_error(format('select public.reopen_concern(%s,%s,''Again'',3,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r6')), 'stale');
select public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),'After reopening');
select public.settle_concern(pg_temp.id('academy'),pg_temp.id('thread'),'Second outcome',3,pg_temp.id('r6'));
select pg_temp.check((select array_agg(e->>'kind' order by ord) from jsonb_array_elements(public.concern_history(pg_temp.id('academy'),pg_temp.id('thread')))
  with ordinality h(e, ord) where e->>'kind' in ('settled','reopened')) = array['settled','reopened','settled'], 'every settlement and reopening kept');
select pg_temp.check((select array_agg(e->>'note' order by ord) from jsonb_array_elements(public.concern_history(pg_temp.id('academy'),pg_temp.id('thread')))
  with ordinality h(e, ord) where e->>'kind' in ('settled','reopened')) = array['First outcome','New evidence','Second outcome'], 'outcomes and reason preserved');
select pg_temp.check(not (public.concern_history(pg_temp.id('academy'),pg_temp.id('thread'))::text like '%Opening history%'), 'history carries no message text');
reset role;

-- A role change removes management without removing access ------------------------------------------
update public.academy_memberships set role='instructor' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check(not (public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->>'canManage')::boolean, 'demoted detail capability');
select pg_temp.expect_error(format('select public.reopen_concern(%s,%s,''Why'',4,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r7')), 'not_permitted');
reset role;
update public.academy_memberships set role='admin' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');

-- Owner recovery: explicit, audited, settled included, Owner only -------------------------------
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_detail(%s,%s)',pg_temp.q('academy'),pg_temp.q('thread')), 'forbidden');
select pg_temp.check(jsonb_array_length(public.search_concerns(pg_temp.id('academy'),'leak'))=0, 'no pre-recovery search');
select pg_temp.check(jsonb_array_length(public.concern_inbox(pg_temp.id('academy'))->'concerns')=0, 'no pre-recovery list');
select pg_temp.expect_error(format('select public.recover_concern(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('foreign'),pg_temp.q('r8')), 'concern_not_found');
select pg_temp.expect_error(format('select public.recover_concern(%s,gen_random_uuid(),%s)',pg_temp.q('academy'),pg_temp.q('r8')), 'concern_not_found');
reset role;
select pg_temp.act('head');
set local role authenticated;
select pg_temp.expect_error(format('select public.recover_concern(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r8')), 'forbidden');
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.recover_concern(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r8')), 'forbidden');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error(format('select public.recover_concern(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r8')), 'forbidden');
select pg_temp.expect_error(format('select public.recover_concern(%s,%s,%s)',pg_temp.q('other'),pg_temp.q('thread'),pg_temp.q('r8')), 'concern_not_found');
reset role;
-- Owner suspension is impossible under the academy invariant; do not build invalid fixtures.
select pg_temp.expect_error(format('update public.academy_memberships set suspended_at=clock_timestamp() where academy_id=%s and user_id=%s',
  pg_temp.q('academy'),pg_temp.q('owner')), '%academy_memberships_owner_not_suspended%');
select pg_temp.act('owner');
select pg_temp.check((select status from public.concerns where id=pg_temp.id('thread'))='settled', 'recovery target is settled');
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.check((public.recover_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('r8'))->>'recovered')::boolean, 'owner recovers settled concern');
select pg_temp.check((public.recover_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('r8'))->>'recovered')::boolean, 'recovery retry');
select pg_temp.check(not (public.recover_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('r9'))->>'recovered')::boolean, 'already a participant');
select pg_temp.expect_error(format('select public.recover_concern(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r4')), 'conflict');
select pg_temp.check(jsonb_array_length(public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'))->'messages')=3, 'recovered owner reads history');
select pg_temp.check((public.concern_detail(pg_temp.id('academy'),pg_temp.id('thread'))->>'status')='settled', 'recovery does not change status');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''x'')',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('r10')), 'concern_settled');
reset role;
select pg_temp.check((select count(*) from public.concern_events where concern_id=pg_temp.id('thread') and kind='owner_recovered'
  and actor_id=pg_temp.id('owner') and subject_id=pg_temp.id('owner'))=1, 'one audited recovery event');
select pg_temp.check((select added_by=pg_temp.id('owner') from public.concern_participants where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('owner')),
  'owner participation attributed to recovery');
select pg_temp.check((select muted from public.concern_participants where concern_id=pg_temp.id('thread') and user_id=pg_temp.id('owner')) = false,
  'no subscription change beyond participation');

-- History integrity --------------------------------------------------------------------------------
select pg_temp.check(pg_temp.kinds() = array['created','participant_added','participant_added','participant_added','participant_removed',
  'participant_added','settled','reopened','settled','owner_recovered'], 'complete ordered history: '||pg_temp.kinds()::text);
select pg_temp.check(pg_temp.version() = 4, 'lifecycle version counts transitions');

-- No-op commands still reserve their request IDs; retries cannot undo subsequent membership work.
do $$
declare c uuid := gen_random_uuid(); add_id uuid := gen_random_uuid(); remove_id uuid := gen_random_uuid();
begin
  perform public.create_concern(pg_temp.id('academy'), c, gen_random_uuid(), 'Retry fixture', 'Opening', array[pg_temp.id('member')]);
  perform public.add_concern_participants(pg_temp.id('academy'), c, array[pg_temp.id('member')], add_id);
  perform public.remove_concern_participant(pg_temp.id('academy'), c, pg_temp.id('member'), gen_random_uuid());
  perform public.add_concern_participants(pg_temp.id('academy'), c, array[pg_temp.id('member')], add_id);
  perform pg_temp.check((select removed_at is not null from public.concern_participants where concern_id=c and user_id=pg_temp.id('member')), 'no-op add retry cannot readd');
  perform public.remove_concern_participant(pg_temp.id('academy'), c, pg_temp.id('spare'), remove_id);
  perform public.add_concern_participants(pg_temp.id('academy'), c, array[pg_temp.id('spare')], gen_random_uuid());
  perform public.remove_concern_participant(pg_temp.id('academy'), c, pg_temp.id('spare'), remove_id);
  perform pg_temp.check((select removed_at is null from public.concern_participants where concern_id=c and user_id=pg_temp.id('spare')), 'no-op removal retry cannot remove');
  perform pg_temp.expect_error(format('select public.add_concern_participants(%L,%L,array[%L]::uuid[],%L)', pg_temp.id('academy'),c,pg_temp.id('spare'),add_id), 'conflict');
  perform pg_temp.check(public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||c||':'||pg_temp.id('owner')), 'own personal topic allowed');
  perform pg_temp.check(not public.can_join_concern_channel('concern:'||pg_temp.id('academy')||':'||c||':'||pg_temp.id('spare')), 'cannot join another recipient topic');
  perform pg_temp.check(not exists(select 1 from edra_private.concern_recipients(pg_temp.id('academy'),c) u where u=pg_temp.id('member')), 'removed recipient excluded from delivery');
  update public.academy_memberships set suspended_at=clock_timestamp() where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('spare');
  perform pg_temp.check(not exists(select 1 from edra_private.concern_recipients(pg_temp.id('academy'),c) u where u=pg_temp.id('spare')), 'suspended recipient excluded from delivery');
  perform pg_temp.check(exists(select 1 from jsonb_array_elements(public.concern_detail(pg_temp.id('academy'),c)->'participants') p where p->>'userId'=pg_temp.id('spare')::text and (p->>'suspended')::boolean), 'suspended participant remains manageable');
  insert into public.concern_events(academy_id,concern_id,actor_id,kind,subject_id)
    select pg_temp.id('academy'),c,pg_temp.id('owner'),'participant_added',pg_temp.id('spare') from generate_series(1,501);
  perform pg_temp.check(jsonb_array_length(public.concern_history(pg_temp.id('academy'),c)) > 500, 'full history is not truncated');
end $$;
rollback;
