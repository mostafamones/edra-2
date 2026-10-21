import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { checkedTarget, privateJson, sql, validateTarget } from './target.mjs';

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const save = (path, data) => writeFileSync(path, JSON.stringify(data), { mode: 0o600 });
const mask = (value) => console.log(`::add-mask::${value}`);
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`Fixture RPC ${name} failed (${error.code})`);
  return data;
}
async function login(target, phone, password) {
  const client = createClient(target.apiUrl, target.publicKey, options);
  const { data, error } = await client.auth.signInWithPassword({ phone, password });
  if (error || !data.session) throw new Error('Fixture password login failed');
  const claims = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString());
  if (!claims.amr?.some((entry) => entry.method === 'password') || !claims.session_id) throw new Error('Password AMR/session absent');
  if (sql(target, "select count(*) from auth.sessions where id = :'session'::uuid and user_id = :'user'::uuid;", { session: claims.session_id, user: data.user.id }) !== '1') throw new Error('Live Auth session absent');
  return client;
}

async function main() {
  const action = process.argv[2];
  if (action === 'status') {
    const status = privateJson(process.argv[3]);
    const project = process.argv[4];
    // CLI JSON is data only. Never source its shell/env output.
    const target = validateTarget({ project, apiUrl: status.API_URL, publicKey: status.ANON_KEY, adminKey: status.SERVICE_ROLE_KEY, dbUrl: status.DB_URL });
    for (const value of [target.adminKey, target.publicKey, new URL(target.dbUrl).password]) mask(value);
    save(process.env.ATTENDANCE_TARGET, target);
    return;
  }
  const target = checkedTarget();
  if (action === 'config') {
    const fixture = privateJson(process.env.ATTENDANCE_FIXTURE);
    if (fixture.project !== target.project || fixture.apiUrl !== target.apiUrl || fixture.publicKey !== target.publicKey) throw new Error('Fixture target mismatch');
    console.log(JSON.stringify({ apiUrl: target.apiUrl, publicKey: target.publicKey }));
    return;
  }
  if (action === 'snapshot') {
    const session = process.argv[3];
    if (!/^[0-9a-f-]{36}$/.test(session ?? '')) throw new Error('Invalid snapshot session');
    // Include receipts and full rows, not merely aggregate attendance counts.
    console.log(sql(target, `select jsonb_build_object(
      'session', (select to_jsonb(s) from public.sessions s where id = :'session'::uuid),
      'records', (select coalesce(jsonb_agg(to_jsonb(r) order by annual_student_record_id), '[]') from public.attendance_records r where session_id = :'session'::uuid),
      'sheet', (select to_jsonb(s) from public.attendance_sheets s where session_id = :'session'::uuid),
      'receipts', (select coalesce(jsonb_agg(to_jsonb(r) order by actor_id, idempotency_key), '[]') from public.attendance_requests r where session_id = :'session'::uuid),
      'publications', (select count(*) from public.attendance_publications where session_id = :'session'::uuid)
    );`, { session }));
    return;
  }
  if (action !== 'fixtures') throw new Error('Unknown fixture action');
  const expectedMigrations = readdirSync('supabase/migrations').filter((name) => /^\d+_.*\.sql$/.test(name)).map((name) => name.split('_')[0]).sort();
  const actualMigrations = sql(target, 'select version from supabase_migrations.schema_migrations order by version;').split('\n');
  if (JSON.stringify(actualMigrations) !== JSON.stringify(expectedMigrations)) throw new Error('Migration history differs from checkout');
  // Reload PostgREST config/schema after migrations and prove the live-session hook stayed set.
  if (sql(target, "select rolconfig @> array['pgrst.db_pre_request=edra_auth.check_request'] from pg_roles where rolname = 'authenticator';") !== 't') throw new Error('Required PostgREST pre-request hook absent');
  sql(target, "notify pgrst, 'reload config'; notify pgrst, 'reload schema';");
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${target.apiUrl}/auth/v1/health`, { headers: { apikey: target.publicKey }, signal: AbortSignal.timeout(3000) });
      if (response.ok) break;
    } catch { /* bounded readiness below */ }
    if (attempt >= 30) throw new Error('Auth readiness timeout');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const suffix = randomBytes(5).toString('hex');
  const password = `Attendance-${randomBytes(24).toString('base64url')}!`;
  mask(password);
  // Synthetic numbers are unique within this disposable instance and never sent to an SMS service.
  const digits = String(parseInt(randomBytes(4).toString('hex'), 16) % 10000000).padStart(7, '0');
  const ownerNumbers = ['0', '2', '3'].map((prefix) => `+2010${prefix}${digits}`);
  const instructorNumber = `+20101${digits}`;
  const admin = createClient(target.apiUrl, target.adminKey, options);
  async function user(number, name) {
    const { data, error } = await admin.auth.admin.createUser({ phone: number, password, phone_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) throw new Error('Synthetic Auth user creation failed');
    return data.user.id;
  }
  // One owned academy per user, so each fixture academy gets its own owner.
  const owners = [];
  for (const number of ownerNumbers) owners.push(await user(number, `Fixture Owner ${suffix}`));
  const instructorName = `Fixture Instructor ${suffix}`;
  const instructor = await user(instructorNumber, instructorName);
  const academies = [];
  for (const [index, letter] of ['A', 'B', 'C'].entries()) {
    const owner = owners[index];
    const id = randomUUID(), group = randomUUID();
    const name = `Fixture ${letter} ${suffix}`, slug = `fixture-${letter.toLowerCase()}-${suffix}`;
    // Tightly scoped bootstrap, committed for HTTP connections. Academy triggers create the
    // current Cairo academic year; no session/roster/attendance rows are inserted here.
    const year = sql(target, `begin;
      insert into public.academies(id, name, slug, icon, subject, created_by)
        values (:'id', :'name', :'slug', 'school', 'Math', :'owner');
      insert into public.academy_memberships(academy_id, user_id, role, created_by) values (:'id', :'owner', 'owner', :'owner');
      ${letter !== 'C' ? "insert into public.academy_memberships(academy_id, user_id, role, created_by) values (:'id', :'instructor', 'instructor', :'owner');" : ''}
      insert into public.academy_levels(academy_id, level_id, sort_order) values (:'id', 'preparatory-3', 9);
      insert into public.groups(id, academy_id, academic_year_id, level_id, name)
        select :'group', :'id', id, 'preparatory-3', 'Fixture Group' from public.academic_years where academy_id = :'id' and closed_at is null;
      select id from public.academic_years where academy_id = :'id' and closed_at is null;
      commit;`, { id, name, slug, owner, instructor, group });
    academies.push({ id, name, slug, group, year, schedule: '', title: `Fixture Schedule ${letter} ${suffix}`, students: [], session: '' });
  }
  const ownerClients = [];
  for (const number of ownerNumbers) ownerClients.push(await login(target, number, password));
  const instructorClient = await login(target, instructorNumber, password);
  for (let attempt = 0; ; attempt++) {
    const result = await ownerClients[0].from('profiles').select('id').eq('id', owners[0]);
    if (!result.error && result.data?.length === 1) break;
    if (attempt >= 30) throw new Error('PostgREST readiness timeout');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const { data: probeSession } = await instructorClient.auth.getSession();
  const revokedToken = probeSession.session.access_token;
  try {
    for (const [index, academy] of academies.entries()) {
      const ownerClient = ownerClients[index];
      academy.schedule = await rpc(ownerClient, 'create_schedule', {
        p_academy_id: academy.id, p_academic_year_id: academy.year, p_title: academy.title,
        p_kind: 'recurring', p_audience: 'group', p_group_id: academy.group, p_level_id: null, p_track_id: null,
        p_mandatory: true, p_location: 'Fixture Room', p_slots: [{ weekday: 1, startsAt: '17:00', endsAt: '18:00' }], p_sessions: [],
      });
      if (academy === academies[0]) continue;
      for (const label of academy === academies[1] ? ['Target', 'Control'] : ['Forbidden Student']) {
        const name = `Fixture ${label} ${suffix}`;
        const record = await rpc(ownerClient, 'create_student_record', {
          p_academy_id: academy.id, p_academic_year_id: academy.year, p_full_name: name,
          p_student_phone: `010${String(academy.students.length + 1).padStart(8, '0')}`, p_parent_phone: '01100000000', p_level_id: 'preparatory-3',
          p_track_id: null, p_primary_group_id: academy.group, p_participation_type: 'in_person',
        });
        academy.students.push({ id: record[0].id, name });
      }
    }
    const c = academies[2];
    const started = await rpc(ownerClients[2], 'start_session', { p_academy_id: c.id, p_schedule_id: c.schedule, p_start_key: randomUUID() });
    c.session = started[0].session_id;
    save(process.env.ATTENDANCE_FIXTURE, { project: target.project, apiUrl: target.apiUrl, publicKey: target.publicKey, phone: instructorNumber, password, instructor, instructorName, academies });
  } finally {
    const signedOut = await Promise.all([...ownerClients.map((client) => client.auth.signOut()), instructorClient.auth.signOut()]);
    if (signedOut.some((result) => result.error)) throw new Error('Auxiliary Auth signout failed');
    const revoked = await fetch(`${target.apiUrl}/rest/v1/profiles?select=id`, {
      headers: { apikey: target.publicKey, Authorization: `Bearer ${revokedToken}` }, signal: AbortSignal.timeout(5000),
    });
    if (revoked.status !== 401 || (await revoked.json()).code !== 'EDRA_SESSION_INACTIVE') throw new Error('PostgREST live-session hook is not active');
  }
}
main().catch((error) => {
  const safe = /^(Fixture RPC [a-z_]+ failed \([A-Z0-9]+\)|Synthetic Auth user creation failed|Fixture password login failed|Password AMR\/session absent|Live Auth session absent|Migration history differs from checkout|Required PostgREST pre-request hook absent|PostgREST live-session hook is not active|Auth readiness timeout|PostgREST readiness timeout|Auxiliary Auth signout failed)$/;
  console.error('attendance-ci: ' + (safe.test(error.message) ? error.message : 'setup/assertion failed; raw service output withheld'));
  if (!safe.test(error.message)) {
    // Diagnostics only: error class, the first psql ERROR line (no credentials) and the throwing source line.
    const sqlError = String(error.stderr ?? '').split('\n').find((line) => line.includes('ERROR:'));
    console.error(`attendance-ci: ${error.name}${sqlError ? `: ${sqlError.replace(/\s+/g, ' ').slice(0, 300)}` : ''} at ${(error.stack ?? '').split('\n').find((line) => line.includes('setup.mjs'))?.trim() ?? 'unknown'}`);
  }
  process.exitCode = 1;
});
