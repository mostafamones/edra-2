import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Command-safety checks for scripts/db-test.sh and supabase/tests/concurrency.sh. psql, docker and
// supabase are fakes on PATH that log their calls, so no database or local stack is needed.
const web = join(__dirname, "..");
const runner = join(web, "scripts/db-test.sh");
const concurrency = join(web, "supabase/tests/concurrency.sh");

const fakePsql = readFileSync(join(web, "scripts/fixtures/fake-psql.sh"), "utf8");
const fakeTool = (name: string) => `#!/usr/bin/env bash\necho "${name} $*" >>"$FAKE_LOG"\n`;

let dir: string;
let log: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "db-test-"));
  log = join(dir, "calls.log");
  writeFileSync(log, "");
  for (const [name, body] of [
    ["psql", fakePsql],
    ["docker", fakeTool("docker")],
    ["supabase", fakeTool("supabase")],
  ]) {
    writeFileSync(join(dir, name), body);
    chmodSync(join(dir, name), 0o755);
  }
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const target = "postgresql://postgres.abcdefghijklmnop:s3cr%40t-pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";

function run(script: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    PATH: `${dir}:${process.env.PATH}`,
    HOME: dir,
    FAKE_LOG: log,
    FAKE_MARKER: "edra-ci",
    NEXT_PUBLIC_SUPABASE_URL: "https://appprojectref.supabase.co",
    EDRA_DB_TEST_URL: target,
    EDRA_DB_TEST_TARGET: "edra-ci",
  };
  const merged = { ...base, ...env };
  const result = spawnSync("bash", [script, ...args], {
    cwd: web,
    encoding: "utf8",
    env: Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as NodeJS.ProcessEnv,
    timeout: 60_000,
  });
  const calls = readFileSync(log, "utf8")
    .split("CALL\n")
    .filter(Boolean);
  return { status: result.status, output: result.stdout + result.stderr, calls };
}

describe("db-test runner", () => {
  it.each([
    ["no URL", { EDRA_DB_TEST_URL: undefined }, "EDRA_DB_TEST_URL is not set"],
    ["no target name", { EDRA_DB_TEST_TARGET: undefined }, "EDRA_DB_TEST_TARGET is not set"],
    ["a non-URL connection", { EDRA_DB_TEST_URL: "host=db.example.com" }, "must be a postgres://"],
    [
      "a transaction pooler",
      { EDRA_DB_TEST_URL: target.replace(":5432/", ":6543/") },
      "transaction pooler",
    ],
    [
      "the app's own project",
      { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" },
      "app's configured Supabase project",
    ],
  ])("rejects %s before connecting", (_, env, message) => {
    const { status, output, calls } = run(runner, [], env);
    expect(status).toBe(2);
    expect(output).toContain(message);
    expect(calls).toEqual([]);
  });

  it.each([
    ["an unmarked target", { FAKE_MARKER: "" }, "no edra_db_test.target marker"],
    ["a different target", { FAKE_MARKER: "shared-dev" }, "expected 'edra-ci'"],
    ["missing migrations", { FAKE_MISSING: "20261009100000" }, "missing: 20261009100000"],
  ])("rejects %s after only the read-only preflight", (_, env, message) => {
    const { status, output, calls } = run(runner, [], env);
    expect(status).toBe(2);
    expect(output).toContain(message);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("begin transaction read only;");
    expect(calls[0]).not.toMatch(/^\s*(insert into|update \S+ set|delete from|create|alter|grant)\b/im);
  });

  it("keeps the password out of arguments and output", () => {
    const passed = run(runner, ["--check"]);
    expect(passed.status).toBe(0);
    expect(passed.calls[0]).toContain("PGPASSWORD s3cr@t-pw");
    expect(passed.calls[0]).not.toMatch(/ARGV .*s3cr/);
    expect(passed.output).not.toContain("s3cr");

    const failed = run(runner, ["--check"], { FAKE_CONNECT_FAIL: "1" });
    expect(failed.status).toBe(2);
    expect(failed.output).toContain("<host>");
    expect(failed.output).not.toMatch(/s3cr|pooler\.supabase\.com|abcdefghijklmnop/);
  });

  it("writes nothing with --check", () => {
    const { status, output, calls } = run(runner, ["--check"]);
    expect(status).toBe(0);
    expect(output).toContain("--check wrote nothing");
    expect(calls).toHaveLength(1);
  });

  it("runs the selected suites with ON_ERROR_STOP and never starts or resets a stack", () => {
    const { status, output, calls } = run(runner, ["groups_schedules", "attendance"]);
    expect(status).toBe(0);
    expect(output).toContain("passed 2 suite(s): groups_schedules attendance");
    const suiteCalls = calls.slice(1);
    expect(suiteCalls.map((call) => call.match(/FILES (.*)/)?.[1])).toEqual([
      "supabase/tests/groups_schedules.sql",
      "supabase/tests/attendance.sql",
    ]);
    for (const call of suiteCalls) expect(call).toMatch(/ARGV .*-X -v ON_ERROR_STOP=1/);
    expect(readFileSync(log, "utf8")).not.toMatch(/^(docker|supabase) /m);
    expect(readFileSync(runner, "utf8")).not.toMatch(/docker|supabase (start|db reset)/);
  });

  it("stops with a non-zero status when a SQL suite fails", () => {
    const { status, output, calls } = run(runner, ["sessions", "attendance"], { FAKE_FAIL_FILE: "sessions.sql" });
    expect(status).toBe(1);
    expect(output).toContain("FAILED sessions");
    expect(calls.some((call) => call.includes("FILES supabase/tests/attendance.sql"))).toBe(false);
  });

  it("rejects an unknown suite", () => {
    const { status, calls } = run(runner, ["everything"]);
    expect(status).toBe(2);
    expect(calls).toEqual([]);
  });
});

describe("concurrency harness", () => {
  it("refuses to run without the runner's validated target", () => {
    const { status, output, calls } = run(concurrency, []);
    expect(status).toBe(2);
    expect(output).toContain("run through npm run test:db");
    expect(calls).toEqual([]);
  });

  it("fails when a lock holder errors instead of letting the background failure disappear", () => {
    const { status, output } = run(runner, ["concurrency"], {
      FAKE_READY: "0",
      FAKE_FAIL_MATCH: "'application_name', 'edra-race-[^']*-1a'",
    });
    expect(status).toBe(1);
    expect(output).toContain("holder 1a ended before holding its lock");
    expect(output).toContain("FAILED concurrency");
    expect(output).toMatch(/retained fixtures for run \S+: academy [0-9a-f-]{36}/);
  });

  it("does not count a lost connection as the expected rejection", () => {
    const { status, output } = run(runner, ["concurrency"], {
      FAKE_FAIL_MATCH: "'application_name', 'edra-race-[^']*-1b'",
      FAKE_FAIL_CODE: "2",
      FAKE_FAIL_MESSAGE: "server closed the connection unexpectedly",
    });
    expect(status).toBe(1);
    expect(output).toContain("schedule created on a group archived concurrently (status 2)");
  });

  it("re-checks the target marker before writing", () => {
    const env = {
      EDRA_DB_TEST_CONN: "postgresql://postgres@db.example.com:5432/postgres",
      EDRA_DB_TEST_RUN: "20261012t000000z-abcd",
      FAKE_MARKER: "shared-dev",
    };
    const { status, output, calls } = run(concurrency, [], env);
    expect(status).toBe(2);
    expect(output).toContain("target marker does not match");
    expect(calls).toHaveLength(1);
  });
});
