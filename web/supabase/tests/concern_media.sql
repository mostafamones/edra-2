-- Concern media: reservation limits and identity, server verification, binding authority (owner,
-- concern, academy, state, count), media-only messages, deletion revocation, settled/removed access,
-- quote/inbox/search summaries, expiry and purge leases. CI runs this only on its disposable database.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Concern media check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table md_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into md_ids(name) values ('admin'),('member'),('spare'),('outsider'),('academy'),('other'),
  ('thread'),('second'),('foreign'),('m1'),('m2'),('m3'),('m4'),('m5'),('m6'),('m7'),('s1'),('f1'),
  ('a1'),('a2'),('a3'),('a4'),('a5'),('a6'),('v1'),('v2'),('x1'),('z1'),('p1'),('p2'),('p3');
grant select on pg_temp.md_ids to authenticated, service_role;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.md_ids where name=label $$;
create function pg_temp.q(label text) returns text language sql as $$ select quote_literal(pg_temp.id(label)) $$;
create function pg_temp.act(label text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(label)::text,''), true)
$$;
create function pg_temp.reserve(label text, concern text default 'thread', kind text default 'file', bytes bigint default 1000) returns jsonb
language sql as $$ select public.reserve_concern_attachment(pg_temp.id('academy'), pg_temp.id(concern), pg_temp.id(label), kind, label || '.bin', bytes) $$;
create function pg_temp.state(label text) returns text language sql security definer as $$
  select state from public.concern_attachments where id = pg_temp.id(label) $$;

do $$ begin
  if has_function_privilege('anon','public.reserve_concern_attachment(uuid,uuid,uuid,text,text,bigint)','execute')
    or not has_function_privilege('authenticated','public.reserve_concern_attachment(uuid,uuid,uuid,text,text,bigint)','execute')
    or not has_function_privilege('authenticated','public.concern_attachment_access(uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.verify_concern_attachment(uuid,boolean,text,numeric)','execute')
    or has_function_privilege('authenticated','public.claim_concern_media_purge(integer)','execute')
    or has_function_privilege('authenticated','public.complete_concern_media_purge(uuid[])','execute')
    or not has_function_privilege('service_role','public.verify_concern_attachment(uuid,boolean,text,numeric)','execute')
    or has_function_privilege('authenticated','edra_private.expire_concern_uploads(integer)','execute')
    or has_function_privilege('authenticated','edra_private.concern_user_active(uuid,uuid,uuid)','execute')
    or has_table_privilege('authenticated','public.concern_attachments','select')
    or has_table_privilege('anon','public.concern_attachments','select')
    or (select public from storage.buckets where id = 'concern-media') is distinct from false
    or (select file_size_limit from storage.buckets where id = 'concern-media') is distinct from 26214400
    or exists (select 1 from pg_policies where schemaname = 'storage' and qual like '%concern-media%') then
    raise exception 'Concern media check failed: grants, bucket and policies';
  end if;
  if not exists (select 1 from cron.job where jobname = 'edra-concern-upload-expiry') then
    raise exception 'Concern media check failed: expiry job scheduled';
  end if;
end $$;

insert into auth.users(id) select id from md_ids where name in ('admin','member','spare','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Media fixture','concern-media-'||pg_temp.id('academy'),'school','Math',pg_temp.id('admin')),
 (pg_temp.id('other'),'Other media','concern-media-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('admin')),
 (pg_temp.id('academy'),pg_temp.id('member'),'instructor',pg_temp.id('admin')),
 (pg_temp.id('academy'),pg_temp.id('spare'),'instructor',pg_temp.id('admin')),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));

select pg_temp.act('admin');
set local role authenticated;
select public.create_concern(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m1'),'Media','Opening',array[pg_temp.id('member')]);
select public.create_concern(pg_temp.id('academy'),pg_temp.id('second'),pg_temp.id('s1'),'Second','Opening','{}');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select public.create_concern(pg_temp.id('other'),pg_temp.id('foreign'),pg_temp.id('f1'),'Elsewhere','Opening','{}');
reset role;

-- Reservation -----------------------------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check((pg_temp.reserve('a1')->>'state') = 'pending', 'reservation is pending');
reset role;
select pg_temp.check((select upload_expires_at > clock_timestamp() + interval '2 hours' from public.concern_attachments where id = pg_temp.id('a1')),
  'a pending reservation records how long its signed upload URLs may stay valid');
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check(pg_temp.reserve('a1')->>'state' = 'pending'
  and pg_temp.reserve('a1')->>'path' = pg_temp.id('academy')||'/'||pg_temp.id('thread')||'/'||pg_temp.id('a1'), 'reservation retry returns the same path');
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''file'',''other.bin'',1000)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a1')), 'conflict');
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''file'',''big.bin'',26214401)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('x1')), 'attachment_too_large');
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''file'',''a/b'',10)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('x1')), 'validation');
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''image'',''a.png'',10)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('x1')), 'validation');
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''file'',''a.bin'',10)',pg_temp.q('academy'),pg_temp.q('second'),pg_temp.q('x1')), 'forbidden');
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''file'',''a.bin'',10)',pg_temp.q('other'),pg_temp.q('foreign'),pg_temp.q('x1')), 'forbidden');
select pg_temp.reserve('a2'); select pg_temp.reserve('a3'); select pg_temp.reserve('a4');
select pg_temp.reserve('v1', 'thread', 'voice'); select pg_temp.reserve('v2', 'thread', 'voice');
select pg_temp.expect_error('select count(*) from public.concern_attachments', 'permission denied%');
-- Unverified uploads cannot be sent.
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2'),pg_temp.q('a1')), 'attachment_unavailable');
select pg_temp.check(public.concern_attachment_upload(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('a1'))->>'state' = 'pending', 'uploader reads own pending upload');
reset role;
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_attachment_upload(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a1')), 'attachment_unavailable');
reset role;

-- Server verification (service role) --------------------------------------------------------------
set local role service_role;
select public.verify_concern_attachment(pg_temp.id('a1'), true, 'image/png');
select pg_temp.check(public.verify_concern_attachment(pg_temp.id('a1'), true, 'image/png')->>'state' = 'ready', 'verification is idempotent');
select public.verify_concern_attachment(pg_temp.id('a2'), true, 'application/pdf');
select public.verify_concern_attachment(pg_temp.id('a3'), true, 'application/octet-stream');
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''text/html'',null)',pg_temp.q('v1')), 'validation');
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''audio/webm'',300.5)',pg_temp.q('v1')), 'validation');
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''audio/webm'',null)',pg_temp.q('v1')), 'validation');
-- Only Opus containers the server can measure are voice notes; MP4/AAC is not accepted.
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''audio/mp4'',12)',pg_temp.q('v1')), 'validation');
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''image/png'',12)',pg_temp.q('a4')), 'validation');
select public.verify_concern_attachment(pg_temp.id('v1'), true, 'audio/webm', 12.5);
select pg_temp.check(public.verify_concern_attachment(pg_temp.id('v2'), false, null)->>'state' = 'removed', 'rejected bytes are removed');
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''audio/ogg'',3)',pg_temp.q('v2')), 'attachment_unavailable');
reset role;

-- Binding authority -------------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2'),pg_temp.q('a1')), 'attachment_unavailable');
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2')), 'validation');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''   '',null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2'),pg_temp.q('a1')), 'validation');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',array[%s,%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2'),pg_temp.q('a1'),pg_temp.q('a1')), 'validation');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2'),pg_temp.q('v2')), 'attachment_unavailable');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',(select array_agg(gen_random_uuid()) from generate_series(1,11)))',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m2')), 'attachment_limit');
-- A media-only live message: null text, not deleted, descriptors in order, no storage path.
select pg_temp.check((select m->>'body' is null and m->>'deletedAt' is null and jsonb_array_length(m->'attachments') = 3
    and m->'attachments'->0->>'id' = pg_temp.id('v1')::text and m->'attachments'->0->>'kind' = 'voice'
    and (m->'attachments'->0->>'durationSeconds')::numeric = 12.5 and m->'attachments'->1->>'contentType' = 'image/png'
    and not (m->'attachments'->0 ? 'path') and not (m->'attachments'->0 ? 'state')
  from public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),null,null,'{}',
    array[pg_temp.id('v1'),pg_temp.id('a1'),pg_temp.id('a2')]) m), 'media-only message carries ordered descriptors');
select pg_temp.check(jsonb_array_length(public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2'),null,null,'{}',
  array[pg_temp.id('v1'),pg_temp.id('a1'),pg_temp.id('a2')])->'attachments') = 3, 'send retry returns the original media');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,''again'',null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3'),pg_temp.q('a1')), 'attachment_unavailable');
select pg_temp.expect_error(format('select public.discard_concern_attachment(%s,%s,%s); select public.concern_attachment_upload(%s,%s,%s)',
  pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a1'),pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a1')), 'attachment_unavailable');
select pg_temp.check(pg_temp.state('a1') = 'bound', 'discarding cannot remove sent media');
-- Text with a file, replying to the media message; quote and inbox summarize the media.
select pg_temp.check((select m->'replyTo'->'media' = '{"count":3,"voice":true}'::jsonb and m->'replyTo'->>'body' is null
    and not (m->'replyTo'->>'deleted')::boolean
  from public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),'See file',pg_temp.id('m2'),'{}',array[pg_temp.id('a3')]) m),
  'quote summarizes live media');
select pg_temp.check((select c->'last'->'media' = '{"count":1,"voice":false}'::jsonb from jsonb_array_elements(public.concern_inbox(pg_temp.id('academy'))->'concerns') c
  where (c->>'id')::uuid = pg_temp.id('thread')), 'inbox last message media');
select pg_temp.check(exists (select 1 from jsonb_array_elements(public.search_concerns(pg_temp.id('academy'),'a2.bin')) h
  where (h->>'messageId')::uuid = pg_temp.id('m2') and h->'media'->>'count' = '3'), 'search finds live attachment names');
reset role;

-- Retrieval and editing -----------------------------------------------------------------------------
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check(public.concern_attachment_access(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('a1'))->>'contentType' = 'image/png',
  'participant may retrieve live media');
select pg_temp.expect_error(format('select public.concern_attachment_access(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('second'),pg_temp.q('a1')), 'attachment_unavailable');
reset role;
select pg_temp.act('spare');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_attachment_access(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a1')), 'forbidden');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_attachment_access(%s,%s,%s)',pg_temp.q('other'),pg_temp.q('thread'),pg_temp.q('a1')), 'forbidden');
select pg_temp.expect_error(format('select public.concern_attachment_access(%s,%s,%s)',pg_temp.q('other'),pg_temp.q('foreign'),pg_temp.q('a1')), 'attachment_unavailable');
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check(jsonb_array_length(public.edit_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),'Edited text')->'attachments') = 1,
  'editing text keeps the media');
select pg_temp.check((public.edit_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),null)->>'body') is null,
  'a media message text can be cleared');
select pg_temp.check(public.edit_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m3'),null)->>'deletedAt' is null,
  'identical media-only retry is not a deletion');
select public.send_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m4'),'Text only');
select pg_temp.expect_error(format('select public.edit_concern_message(%s,%s,%s,null)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m4')), 'validation');

-- Deletion revokes media immediately and removes it from quotes, inbox and search.
select pg_temp.check((select m->'attachments' = '[]'::jsonb and m->>'deletedAt' is not null
  from public.delete_concern_message(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('m2')) m), 'deleted message exposes no media');
select pg_temp.expect_error(format('select public.concern_attachment_access(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a1')), 'attachment_unavailable');
select pg_temp.check((select m->'replyTo'->'media' = 'null'::jsonb and (m->'replyTo'->>'deleted')::boolean
  from jsonb_array_elements(public.concern_messages_page(pg_temp.id('academy'),pg_temp.id('thread'))->'messages') m
  where (m->>'id')::uuid = pg_temp.id('m3')), 'quote of a deleted media message has no media');
select pg_temp.check(not exists (select 1 from jsonb_array_elements(public.search_concerns(pg_temp.id('academy'),'a2.bin')) h), 'deleted names leave search');
reset role;
select pg_temp.check((select bool_and(state = 'removed' and removed_at is not null) from public.concern_attachments
  where id in (pg_temp.id('v1'), pg_temp.id('a1'), pg_temp.id('a2'))), 'deletion removes bound media');

-- Limits ----------------------------------------------------------------------------------------------
select pg_temp.act('member');
set local role authenticated;
do $$ begin
  for i in 1..19 loop
    perform public.reserve_concern_attachment(pg_temp.id('academy'), pg_temp.id('thread'), gen_random_uuid(), 'file', 'f.bin', 10);
  end loop;
end $$;
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,gen_random_uuid(),''file'',''f.bin'',10)',pg_temp.q('academy'),pg_temp.q('thread')), 'attachment_limit');
select public.discard_concern_attachment(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('a4'));
select pg_temp.check(pg_temp.reserve('a5')->>'state' = 'pending', 'discarding frees an open upload slot');
reset role;

-- Settled and removed participants ------------------------------------------------------------------
set local role service_role;
select public.verify_concern_attachment(pg_temp.id('a5'), true, 'image/jpeg');
reset role;
-- Pending uploads for the verification denials below (the member's open-upload quota is full).
insert into public.concern_attachments (id, academy_id, concern_id, uploader_id, kind, name, bytes, upload_expires_at)
  select pg_temp.id(n), pg_temp.id('academy'), pg_temp.id('thread'), pg_temp.id('member'), 'file', n || '.bin', 10, clock_timestamp() + interval '3 hours'
  from unnest(array['p1','p2','p3']) n;
select pg_temp.act('member');
set local role authenticated;
select public.discard_concern_attachment(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('p3'));
reset role;
set local role service_role;
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''image/png'')',pg_temp.q('p3')), 'attachment_unavailable');
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,false,null)',pg_temp.q('p3')), 'attachment_unavailable');
reset role;
select pg_temp.check(pg_temp.state('p3') = 'removed', 'a discarded upload is never resurrected');
select pg_temp.act('admin');
set local role authenticated;
select public.settle_concern(pg_temp.id('academy'),pg_temp.id('thread'),'Done',1,gen_random_uuid());
select pg_temp.check(public.concern_attachment_access(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('a3'))->>'id' = pg_temp.id('a3')::text,
  'settled media stays readable');
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.reserve_concern_attachment(%s,%s,%s,''file'',''a.bin'',10)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a6')), 'concern_settled');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m5'),pg_temp.q('a5')), 'concern_settled');
select pg_temp.expect_error(format('select public.concern_attachment_upload(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a5')), 'concern_settled');
select pg_temp.expect_error(format('select public.delete_concern_message(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m3')), 'concern_settled');
reset role;
-- Settlement blocks server acceptance too; rejecting (cleanup) stays allowed.
set local role service_role;
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''image/png'')',pg_temp.q('p1')), 'concern_settled');
select pg_temp.check(pg_temp.state('p1') = 'pending', 'a settled refusal accepts nothing');
select pg_temp.check(public.verify_concern_attachment(pg_temp.id('p1'), false, null)->>'state' = 'removed', 'rejection still cleans up when settled');
reset role;
select pg_temp.act('admin');
set local role authenticated;
select public.reopen_concern(pg_temp.id('academy'),pg_temp.id('thread'),'More',2,gen_random_uuid());
select public.remove_concern_participant(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('member'),gen_random_uuid());
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.expect_error(format('select public.concern_attachment_access(%s,%s,%s)',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('a3')), 'forbidden');
select pg_temp.expect_error(format('select public.send_concern_message(%s,%s,%s,null,null,''{}'',array[%s]::uuid[])',pg_temp.q('academy'),pg_temp.q('thread'),pg_temp.q('m5'),pg_temp.q('a5')), 'forbidden');
reset role;
-- A removed uploader's bytes cannot be accepted, even by the trusted server.
set local role service_role;
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''image/png'')',pg_temp.q('p2')), 'forbidden');
reset role;
select pg_temp.check(pg_temp.state('p2') = 'pending', 'a revoked uploader acceptance changes nothing');

-- Expiry and purge leases -------------------------------------------------------------------------------
update public.concern_attachments set created_at = clock_timestamp() - interval '25 hours' where id = pg_temp.id('a5');
select pg_temp.check(edra_private.expire_concern_uploads(500) >= 1, 'expiry ran');
select pg_temp.check(pg_temp.state('a5') = 'removed', 'stale unsent uploads expire');
select pg_temp.check(pg_temp.state('a3') = 'bound', 'expiry never touches sent media');
set local role service_role;
select pg_temp.expect_error(format('select public.verify_concern_attachment(%s,true,''image/jpeg'')',pg_temp.q('a5')), 'attachment_unavailable');
-- Removed objects whose signed upload URLs may still be used wait: purging now could let a late upload recreate them.
select pg_temp.check(jsonb_array_length(public.claim_concern_media_purge(100)) = 0, 'purge waits for issued upload URLs to expire');
reset role;
update public.concern_attachments set upload_expires_at = clock_timestamp() - interval '1 minute' where id <> pg_temp.id('p3');
set local role service_role;
select pg_temp.check((select count(*) from jsonb_array_elements(public.claim_concern_media_purge(100)) x
  where (x->>'id')::uuid in (pg_temp.id('a1'), pg_temp.id('a5'), pg_temp.id('v2'))) = 3, 'expired removed objects are leased for purge');
-- Nothing else is offered: leased rows are not handed out twice and p3's upload URL is still live.
select pg_temp.check(jsonb_array_length(public.claim_concern_media_purge(100)) = 0, 'leased objects are not handed out twice');
select public.complete_concern_media_purge(array[pg_temp.id('a1'), pg_temp.id('a3')]);
reset role;
select pg_temp.check((select purged_at is not null from public.concern_attachments where id = pg_temp.id('a1'))
  and (select purged_at is null from public.concern_attachments where id = pg_temp.id('a3')), 'only removed objects are marked purged');
rollback;
