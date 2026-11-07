-- Foundation authority assertions. CI runs these only on its disposable database.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Concerns check failed: %', label; end if; end $$;
create temporary table concern_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into concern_ids(name) values ('owner'),('admin'),('member'),('outsider'),('academy'),('other'),('thread');
grant select on pg_temp.concern_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.concern_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.id(label)::text,''), true)
$$;

insert into auth.users(id) select id from concern_ids where name in ('owner','admin','member','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Concerns fixture','concerns-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other concerns','concerns-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner')),
 (pg_temp.id('academy'),pg_temp.id('member'),'instructor',pg_temp.id('owner')),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));
insert into public.concerns(id,academy_id,title,created_by) values
 (pg_temp.id('thread'),pg_temp.id('academy'),'Staff concern',pg_temp.id('admin'));
insert into public.concern_participants(academy_id,concern_id,user_id,membership_created_at,added_by)
 select academy_id, pg_temp.id('thread'), user_id, created_at, pg_temp.id('admin')
 from public.academy_memberships where academy_id=pg_temp.id('academy') and user_id in (pg_temp.id('admin'),pg_temp.id('member'));
insert into public.concern_events(academy_id,concern_id,actor_id,kind)
 values(pg_temp.id('academy'),pg_temp.id('thread'),pg_temp.id('admin'),'created');

select pg_temp.check(not has_table_privilege('authenticated','public.concerns','insert')
  and not has_table_privilege('authenticated','public.concern_participants','update')
  and not has_table_privilege('authenticated','public.concern_events','delete')
  and not has_table_privilege('anon','public.concerns','select')
  and not has_function_privilege('authenticated','edra_private.require_concern(uuid,uuid,boolean,boolean)','execute'), 'write grants denied');

select pg_temp.act('owner');
set local role authenticated;
select pg_temp.check((select count(*) from public.concerns)=0, 'Owner has no implicit access');
select pg_temp.check((select count(*) from public.concern_events)=0, 'Owner cannot read private history');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.check(not public.concern_has_access(pg_temp.id('academy'),pg_temp.id('thread')), 'cross academy denied');
reset role;
select pg_temp.act('member');
set local role authenticated;
select pg_temp.check((select count(*) from public.concerns)=1, 'Instructor participant reads');
select pg_temp.check((select count(*) from public.concern_participants)=2, 'participant reads roster');
select pg_temp.check((select count(*) from public.concern_events)=1, 'participant reads history');
reset role;

update public.academy_memberships set suspended_at=clock_timestamp() where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('member');
set local role authenticated;
select pg_temp.check((select count(*) from public.concerns)=0, 'suspension immediately denies');
reset role;
update public.academy_memberships set suspended_at=null where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('member');
update public.concern_participants set removed_at=clock_timestamp(), removed_by=pg_temp.id('admin') where user_id=pg_temp.id('member');
set local role authenticated;
select pg_temp.check((select count(*) from public.concerns)=0, 'removed participant denied');
reset role;
update public.concern_participants set removed_at=null, removed_by=null where user_id=pg_temp.id('member');
-- Simulate a newly created academy membership identity without unrelated staff-removal effects.
update public.academy_memberships set created_at=created_at+interval '1 second' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('member');
set local role authenticated;
select pg_temp.check((select count(*) from public.concerns)=0, 'new academy membership cannot inherit participation');
reset role;

select pg_temp.act('admin');
select pg_temp.check((edra_private.require_concern(pg_temp.id('academy'),pg_temp.id('thread'),true,true)).status='ongoing', 'manager write guard');
update public.concerns set status='settled', settled_at=clock_timestamp(), settled_by=pg_temp.id('admin'), outcome='Resolved' where id=pg_temp.id('thread');
select pg_temp.check((edra_private.require_concern(pg_temp.id('academy'),pg_temp.id('thread'),false,false)).status='settled', 'settled reads remain allowed');
do $$ begin
  perform edra_private.require_concern(pg_temp.id('academy'),pg_temp.id('thread'),true,false);
  raise exception 'settled write was allowed';
exception when sqlstate '55000' then null;
end $$;
rollback;
