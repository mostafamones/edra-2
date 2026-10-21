-- Academy profile and contacts (EDRA-128): column grants, Owner/Head Admin-only edits, contact
-- format constraints, immutable identity, atomic failure and compare-and-update on updated_at.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Any failed assertion aborts with an error.

begin;

create function pg_temp.check(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', message; end if;
end;
$$;

create function pg_temp.fails(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;

create function pg_temp.act(account uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(account::text, ''), true);
$$;

do $$ begin
  perform pg_temp.check(
    has_column_privilege('authenticated', 'public.academies', 'name', 'update')
    and has_column_privilege('authenticated', 'public.academies', 'icon', 'update')
    and has_column_privilege('authenticated', 'public.academies', 'subject', 'update')
    and has_column_privilege('authenticated', 'public.academies', 'phone', 'update')
    and has_column_privilege('authenticated', 'public.academies', 'whatsapp', 'update')
    and not has_column_privilege('authenticated', 'public.academies', 'slug', 'update')
    and not has_column_privilege('authenticated', 'public.academies', 'id', 'update')
    and not has_column_privilege('authenticated', 'public.academies', 'created_by', 'update')
    and not has_column_privilege('authenticated', 'public.academies', 'created_at', 'update')
    and not has_column_privilege('authenticated', 'public.academies', 'updated_at', 'update')
    and not has_column_privilege('anon', 'public.academies', 'name', 'update')
    and has_column_privilege('service_role', 'public.academies', 'slug', 'update'),
    'academy profile grants');
  perform pg_temp.check(not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'academies'
      and cmd in ('UPDATE', 'ALL') and policyname <> 'academies_update_owner_or_head_admin'), 'single academy update policy');
end $$;

insert into auth.users (id, phone, phone_confirmed_at) values
  ('ad111111-1111-4111-8111-111111111111', '201066600001', now()),  -- owner of P
  ('ad222222-2222-4222-8222-222222222222', '201066600002', now()),  -- head admin of P
  ('ad333333-3333-4333-8333-333333333333', '201066600003', now()),  -- admin of P
  ('ad444444-4444-4444-8444-444444444444', '201066600004', now()),  -- instructor of P
  ('ad555555-5555-4555-8555-555555555555', '201066600005', now()),  -- suspended head admin of P
  ('ad666666-6666-4666-8666-666666666666', '201066600006', now()),  -- owner of Q only
  ('ad777777-7777-4777-8777-777777777777', '201066600007', now());  -- no membership (removed)

insert into public.academies (id, name, slug, icon, subject, created_by, updated_at) values
  ('adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Profile Academy P', 'profile-academy-p', 'school', 'Mathematics', 'ad111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z'),
  ('adadadad-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Profile Academy Q', 'profile-academy-q', 'book', 'Science', 'ad666666-6666-4666-8666-666666666666', '2026-01-01T00:00:00Z');

insert into public.academy_memberships (academy_id, user_id, role, created_by, suspended_at) values
  ('adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad111111-1111-4111-8111-111111111111', 'owner', 'ad111111-1111-4111-8111-111111111111', null),
  ('adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad222222-2222-4222-8222-222222222222', 'head_admin', 'ad111111-1111-4111-8111-111111111111', null),
  ('adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad333333-3333-4333-8333-333333333333', 'admin', 'ad111111-1111-4111-8111-111111111111', null),
  ('adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad444444-4444-4444-8444-444444444444', 'instructor', 'ad111111-1111-4111-8111-111111111111', null),
  ('adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad555555-5555-4555-8555-555555555555', 'head_admin', 'ad111111-1111-4111-8111-111111111111', now()),
  ('adadadad-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ad666666-6666-4666-8666-666666666666', 'owner', 'ad666666-6666-4666-8666-666666666666', null);

-- New contacts default to null; constraints accept only the canonical Egyptian mobile form.
do $$
declare
  p constant uuid := 'adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
  perform pg_temp.check((select phone is null and whatsapp is null from public.academies where id = p), 'contacts default to null');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set phone = '01012345678' where id = %L $s$, p)), 'local spelling rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set phone = '+20223456789' where id = %L $s$, p)), 'landline rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set whatsapp = '+201312345678' where id = %L $s$, p)), 'invalid prefix rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set whatsapp = '+447700900123' where id = %L $s$, p)), 'foreign number rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set phone = '' where id = %L $s$, p)), 'empty string rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set name = ' ' where id = %L $s$, p)), 'blank name rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set subject = %L where id = %L $s$, repeat('s', 61), p)), 'long subject rejected');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set icon = 'rocket' where id = %L $s$, p)), 'unknown icon rejected');
end $$;

grant usage on schema public, auth to authenticated;
set local role authenticated;

-- Owner and Head Admin edit all five fields; Phone and WhatsApp may match and clear independently.
do $$
declare
  p constant uuid := 'adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  rows integer;
  stamp timestamptz;
begin
  perform pg_temp.act('ad111111-1111-4111-8111-111111111111');
  update public.academies set name = 'Profile Academy P2', icon = 'science', subject = 'Physics & Chemistry',
      phone = '+201012345678', whatsapp = '+201012345678'
    where id = p and updated_at = '2026-01-01T00:00:00Z';
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 1, 'owner saves profile');
  select updated_at into stamp from public.academies where id = p;
  perform pg_temp.check(stamp > '2026-01-01T00:00:00Z', 'updated_at advances');
  perform pg_temp.check((select slug = 'profile-academy-p' and created_by = 'ad111111-1111-4111-8111-111111111111'
    from public.academies where id = p), 'rename keeps slug and creator');

  -- A save against the old baseline matches nothing: the caller must review the newer values.
  update public.academies set name = 'Stale write' where id = p and updated_at = '2026-01-01T00:00:00Z';
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 0 and (select name from public.academies where id = p) = 'Profile Academy P2', 'stale baseline conflicts');

  perform pg_temp.act('ad222222-2222-4222-8222-222222222222');
  update public.academies set phone = null where id = p and updated_at = stamp;
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 1 and (select phone is null and whatsapp = '+201012345678' from public.academies where id = p), 'head admin clears phone only');
  update public.academies set whatsapp = null, phone = '+201512345678' where id = p;
  perform pg_temp.check((select phone = '+201512345678' and whatsapp is null from public.academies where id = p), 'whatsapp clears independently');

  -- One invalid field fails the whole statement.
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set name = 'Half saved', phone = '0101' where id = %L $s$, p)), 'invalid contact fails save');
  perform pg_temp.check((select name = 'Profile Academy P2' and phone = '+201512345678' from public.academies where id = p), 'failed save is atomic');

  -- Identity and metadata are not writable by any member.
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set slug = 'renamed' where id = %L $s$, p)), 'slug not writable');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set created_by = 'ad222222-2222-4222-8222-222222222222' where id = %L $s$, p)), 'creator not writable');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set updated_at = now() - interval '1 day' where id = %L $s$, p)), 'updated_at not writable');
  perform pg_temp.check(pg_temp.fails(format($s$ update public.academies set id = gen_random_uuid() where id = %L $s$, p)), 'id not writable');
end $$;

-- Admin, Instructor, suspended, removed, cross-academy and unauthenticated callers change nothing.
do $$
declare
  p constant uuid := 'adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  q constant uuid := 'adadadad-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  caller uuid;
  rows integer;
begin
  foreach caller in array array['ad333333-3333-4333-8333-333333333333', 'ad444444-4444-4444-8444-444444444444',
      'ad555555-5555-4555-8555-555555555555', 'ad666666-6666-4666-8666-666666666666', 'ad777777-7777-4777-8777-777777777777']::uuid[] loop
    perform pg_temp.act(caller);
    update public.academies set name = 'Hijacked', phone = '+201111111111' where id = p;
    get diagnostics rows = row_count;
    perform pg_temp.check(rows = 0, 'no write for ' || caller);
  end loop;
  perform pg_temp.act('ad333333-3333-4333-8333-333333333333');
  perform pg_temp.check((select phone from public.academies where id = p) = '+201512345678', 'admin still reads the profile');
  perform pg_temp.act('ad111111-1111-4111-8111-111111111111');
  update public.academies set name = 'Cross academy' where id = q;
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 0, 'owner of P cannot edit Q');
  perform pg_temp.act(null);
  update public.academies set name = 'Anonymous' where id = p;
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 0, 'no session, no write');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select name = 'Profile Academy P2' and slug = 'profile-academy-p' and phone = '+201512345678'
    from public.academies where id = 'adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'denied writes had no effect');
  perform pg_temp.check((select name = 'Profile Academy Q' from public.academies where id = 'adadadad-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'other academy untouched');
  perform pg_temp.check((select count(*) = 5 from public.academy_memberships where academy_id = 'adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    and exists (select 1 from public.academic_years where academy_id = 'adadadad-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'memberships and academic years preserved');
end $$;

rollback;
