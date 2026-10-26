import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Lifecycle checks for scripts/db-ci.sh. supabase, docker and psql are fakes on PATH that log their
// calls, so no Docker, database or GitHub runner is needed. The wrapper runs from a copy of scripts/
// and supabase/ whose concurrency harness is a stub: fake psql cannot model real races.
const web = join(__dirname, "..");
// Full runner journeys launch a fake psql process for every SQL suite. Allow for
// that work on busy runners without changing the default timeout for unit tests.
const fullRunnerTimeout = 30_000;

const fakePsql = readFileSync(join(web, "scripts/fixtures/fake-psql.sh"), "utf8");
const fakeSupabase = `#!/usr/bin/env bash
echo "supabase $*" >>"$FAKE_LOG"
case "$*" in
  --version) echo 2.117.0 ;;
  "db start"*)
    work="\${@: -1}"
    (cd "$work" && find . -type f | sort | sed 's/^/WORKFILE /' && grep -h '^project_id' supabase/config.toml) >>"$FAKE_LOG"
    [ -z "\${FAKE_START_FAIL:-}" ] || exit 4 ;;
  stop*) [ -z "\${FAKE_STOP_FAIL:-}" ] || exit 5 ;;
  "gen types"*) echo 'export type Database = {}' ;;
esac
`;

let dir: string;
let log: string;
let runnerTemp: string;
let wrapper: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "db-ci-"));
  log = join(dir, "calls.log");
  runnerTemp = join(dir, "runner-temp");
  mkdirSync(runnerTemp);
  writeFileSync(log, "");
  const copy = join(dir, "web");
  for (const sub of ["scripts", "supabase"]) cpSync(join(web, sub), join(copy, sub), { recursive: true });
  writeFileSync(join(copy, "supabase/tests/concurrency.sh"), `echo "concurrency stub" >>"$FAKE_LOG"\n`);
  wrapper = join(copy, "scripts/db-ci.sh");
  for (const [name, body] of [
    ["psql", fakePsql],
    ["supabase", fakeSupabase],
    ["docker", `#!/usr/bin/env bash\necho "docker $*" >>"$FAKE_LOG"\n`],
  ]) {
    writeFileSync(join(dir, name), body);
    chmodSync(join(dir, name), 0o755);
  }
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    PATH: `${dir}:${process.env.PATH}`,
    HOME: dir,
    FAKE_LOG: log,
    FAKE_MARKER: "@target",
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_TEMP: runnerTemp,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    // Supplied cloud connectivity must be ignored.
    EDRA_DB_TEST_URL: "postgresql://postgres.cloudref:pw@aws-0-eu.pooler.supabase.com:5432/postgres",
    EDRA_DB_TEST_TARGET: "edra-db-check",
    NEXT_PUBLIC_SUPABASE_URL: "https://cloudref.supabase.co",
  };
  const merged = { ...base, ...env };
  const result = spawnSync("bash", [wrapper], {
    cwd: dir,
    encoding: "utf8",
    env: Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as NodeJS.ProcessEnv,
    timeout: 120_000,
  });
  return { status: result.status, output: result.stdout + result.stderr, log: readFileSync(log, "utf8") };
}

const lines = (text: string, prefix: string) => text.split("\n").filter((line) => line.startsWith(prefix));

describe("db-ci wrapper", () => {
  it.each([
    ["outside GitHub Actions", { GITHUB_ACTIONS: undefined }],
    ["on a self-hosted runner", { RUNNER_ENVIRONMENT: "self-hosted" }],
    ["without RUNNER_TEMP", { RUNNER_TEMP: undefined }],
  ])("refuses to run %s before touching Docker or a database", (_, env) => {
    const { status, output, log } = run(env);
    expect(status).toBe(2);
    expect(output).toContain("db-ci:");
    expect(log).toBe("");
  });

  it("builds a fresh workspace, bootstraps it, runs every suite on loopback and removes it", () => {
    const { status, output, log } = run();
    expect(status).toBe(0);
    expect(output).toMatch(/passed \d+ suite\(s\): .* concurrency/);

    const project = log.match(/^project_id = "(edra-db-check-123-2-[0-9a-f]{4})"$/m)?.[1];
    expect(project).toBeDefined();
    const files = lines(log, "WORKFILE ").map((line) => line.slice("WORKFILE ./".length));
    const migrations = readdirSync(join(web, "supabase/migrations")).filter((name) => /^\d+_.*\.sql$/.test(name));
    expect(files.sort()).toEqual(
      ["supabase/config.toml", "supabase/roles.sql", ...migrations.map((name) => `supabase/migrations/${name}`)].sort(),
    );

    expect(log.indexOf("supabase db start")).toBeGreaterThan(-1);
    expect(log.indexOf("supabase db start")).toBeLessThan(log.indexOf("FILES scripts/ci/prepare.sql"));
    expect(log.indexOf("FILES scripts/ci/prepare.sql")).toBeLessThan(log.indexOf("begin transaction read only;"));
    expect(log).toContain(`-v target=${project}`);

    for (const argv of lines(log, "ARGV ").filter((line) => line !== "ARGV --version")) {
      expect(argv).toContain("127.0.0.1:54322");
      expect(argv).not.toMatch(/supabase\.com|cloudref/);
    }
    expect(log).not.toMatch(/^supabase (link|db (push|reset)|migration)/m);
    expect(lines(log, "supabase stop")).toEqual([
      expect.stringMatching(new RegExp(`--project-id ${project} --no-backup$`)),
    ]);
    expect(log).toContain("concurrency stub");
    expect(log).not.toContain("--all");
    expect(readdirSync(runnerTemp)).toEqual([]);
  }, fullRunnerTimeout);

  it.each([
    ["startup", { FAKE_START_FAIL: "1" }, 4],
    ["bootstrap", { FAKE_FAIL_FILE: "prepare.sql" }, 3],
    ["a suite", { FAKE_FAIL_FILE: "attendance.sql" }, 1],
  ])("keeps a %s failure red and still removes the project", (_, env, expected) => {
    const { status, output, log } = run(env);
    expect(status).toBe(expected);
    expect(output).toContain(`failed (exit ${expected})`);
    expect(lines(log, "docker logs")).toHaveLength(1);
    expect(lines(log, "supabase stop")).toHaveLength(1);
    expect(existsSync(runnerTemp) && readdirSync(runnerTemp)).toEqual([]);
  });

  it("reports a cleanup failure instead of passing", () => {
    const { status, output } = run({ FAKE_STOP_FAIL: "1" });
    expect(status).toBe(1);
    expect(output).toContain("cleanup of project");
  }, fullRunnerTimeout);

  it("exports types from the disposable schema without using linked cloud connectivity", () => {
    const typesPath = join(dir, "database.types.ts");
    const { status, log } = run({ EDRA_DB_TYPES_OUTPUT: typesPath });
    expect(status).toBe(0);
    expect(readFileSync(typesPath, "utf8")).toContain("export type Database");
    expect(lines(log, "supabase gen types")).toEqual([
      "supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres --schema public",
    ]);
    expect(log).not.toContain("--linked");
  }, fullRunnerTimeout);
});
