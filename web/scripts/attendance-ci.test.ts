import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { checkedTarget, privateJson, validateTarget } from "../e2e/attendance/target.mjs";

const valid = { project: "edra-attendance-ci-123-1-abcd", apiUrl: "http://127.0.0.1:54321", dbUrl: "postgresql://postgres:fixture@127.0.0.1:54322/postgres", publicKey: "public", adminKey: "private" };
describe("attendance disposable target boundary", () => {
  it("accepts only the expected loopback service ports, identity and settings", () => {
    expect(validateTarget(valid)).toEqual(valid);
    for (const changed of [
      { apiUrl: "https://real-project.supabase.co" }, { apiUrl: "http://127.0.0.1:3000" },
      { dbUrl: "postgresql://postgres:password@cloud.example:54322/postgres" },
      { dbUrl: "postgresql://postgres:password@127.0.0.1:6543/postgres" },
      { dbUrl: valid.dbUrl + "?host=cloud.example" }, { project: "linked-project" }, { adminKey: "" }, { publicKey: "" },
    ]) expect(() => validateTarget({ ...valid, ...changed })).toThrow();
  });
  it("rejects manifests outside the private runner directory and missing manifests", () => {
    expect(() => privateJson(undefined)).toThrow();
  });
  it("requires a private runner manifest and the exact database marker", () => {
    const temp = mkdtempSync(join(tmpdir(), "attendance-manifest-"));
    const outside = mkdtempSync(join(tmpdir(), "attendance-outside-"));
    try {
      vi.stubEnv("GITHUB_ACTIONS", "true"); vi.stubEnv("RUNNER_ENVIRONMENT", "github-hosted"); vi.stubEnv("RUNNER_TEMP", temp);
      const manifest = join(temp, "target.json");
      writeFileSync(manifest, JSON.stringify(valid), { mode: 0o600 });
      vi.stubEnv("ATTENDANCE_TARGET", manifest);
      expect(privateJson(manifest)).toEqual(valid);
      chmodSync(manifest, 0o644);
      expect(() => privateJson(manifest)).toThrow("private");
      chmodSync(manifest, 0o600);
      const other = join(outside, "target.json"); writeFileSync(other, JSON.stringify(valid), { mode: 0o600 });
      expect(() => privateJson(other)).toThrow("RUNNER_TEMP");
      const bin = join(temp, "bin"); mkdirSync(bin);
      const psql = join(bin, "psql");
      writeFileSync(psql, "#!/bin/sh\ncat >/dev/null\necho wrong-project\n"); chmodSync(psql, 0o700);
      vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
      expect(() => checkedTarget()).toThrow("marker mismatch");
      writeFileSync(psql, `#!/bin/sh\ncat >/dev/null\necho '${valid.project}'\n`);
      expect(checkedTarget()).toEqual(valid);
    } finally {
      vi.unstubAllEnvs(); rmSync(temp, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true });
    }
  });
  it("refuses unsupported environments before invoking infrastructure tools", () => {
    const run = spawnSync("bash", ["scripts/attendance-e2e-ci.sh"], { env: { NODE_ENV: "test", PATH: process.env.PATH, GITHUB_ACTIONS: "false" }, encoding: "utf8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("GitHub-hosted");
  });
  it.each([false, true])("preserves startup failure without leaking logs, including cleanup failure=%s", (cleanupFails) => {
    const temp = mkdtempSync(join(tmpdir(), "attendance-guard-"));
    try {
      const bin = join(temp, "bin"); mkdirSync(bin);
      const calls = join(temp, "calls");
      for (const name of ["supabase", "psql", "docker", "node", "npm"]) {
        const path = join(bin, name);
        writeFileSync(path, name === "supabase" ? `#!/bin/bash
if [ "$1" = --version ]; then echo 2.117.0; exit 0; fi
printf '%s\\n' "$*" >> '${calls}'
if [ "$1" = start ]; then echo private-start-output; exit 17; fi
if [ "$1" = stop ]; then exit ${cleanupFails ? 19 : 0}; fi
exit 0
` : "#!/bin/bash\nexit 99\n"); chmodSync(path, 0o700);
      }
      const result = spawnSync("bash", [resolve("scripts/attendance-e2e-ci.sh")], {
        env: { NODE_ENV: "test", PATH: `${bin}:${process.env.PATH}`, GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_TEMP: temp, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" }, encoding: "utf8",
      });
      expect(result.status).toBe(17);
      expect(result.stdout + result.stderr).not.toContain("private-start-output");
      const log = readFileSync(calls, "utf8");
      expect(log).toMatch(/start --workdir .*edra-attendance-ci-123-1-[a-f0-9]+/);
      expect(log).toMatch(/stop --workdir .* --project-id edra-attendance-ci-123-1-[a-f0-9]+ --no-backup/);
      expect(log).not.toContain("--all");
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
