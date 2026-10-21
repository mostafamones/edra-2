// Node only. This module is never imported by application/browser code.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';

export function validateTarget(target) {
  if (!/^edra-attendance-ci-\d+-\d+-[a-f0-9]+$/.test(target.project ?? '')) throw new Error('Invalid attendance project identity');
  const api = new URL(target.apiUrl);
  const db = new URL(target.dbUrl);
  if (api.href !== 'http://127.0.0.1:54321/' || db.protocol !== 'postgresql:' || db.hostname !== '127.0.0.1' || db.port !== '54322' || db.pathname !== '/postgres' || db.username !== 'postgres' || db.search || db.hash) throw new Error('Attendance requires the disposable loopback target');
  if (!target.publicKey || !target.adminKey || !db.password) throw new Error('Missing generated instance settings');
  return target;
}

export function privateJson(path) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || !process.env.RUNNER_TEMP) throw new Error('Attendance infrastructure is GitHub-hosted CI only');
  const root = realpathSync(process.env.RUNNER_TEMP);
  const file = realpathSync(resolve(path ?? ''));
  if (!file.startsWith(root + sep) || (statSync(file).mode & 0o077)) throw new Error('Manifest must be private and inside RUNNER_TEMP');
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function sql(target, statement, variables = {}) {
  validateTarget(target);
  const db = new URL(target.dbUrl);
  const password = decodeURIComponent(db.password);
  db.password = '';
  return execFileSync('psql', [db.href, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', ...Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`])], {
    input: statement, encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env.PATH, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5' },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

export function checkedTarget() {
  const target = validateTarget(privateJson(process.env.ATTENDANCE_TARGET));
  const marker = sql(target, 'select name from edra_db_test.target;');
  if (marker !== target.project) throw new Error('Disposable attendance marker mismatch');
  return target;
}
