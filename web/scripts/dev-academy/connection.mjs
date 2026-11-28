// Cloud target selection and SQL transport for dev-academy. Only allow-listed project refs can be used.
// SQL goes through the Supabase Management API database query endpoint because the development project's
// direct database password is not provisioned for this tooling and psql is not installed. SQL is sent in
// the request body, never as command arguments, and credentials never appear in logs.
import fs from "node:fs";
import os from "node:os";
import { randomBytes } from "node:crypto";

export const TARGETS = Object.freeze({
  fgbcjlibwgxylfwmocgx: "development",
});

const MAX_ERROR_CHARS = 1500;
const SQL_TIMEOUT_MS = 120_000;

/** Validates the project ref against the allow-list and checks the app URL points at the same project. */
export function resolveTarget(projectRef, env = process.env) {
  if (!/^[a-z]{20}$/.test(projectRef) || !Object.hasOwn(TARGETS, projectRef)) {
    throw new Error("Unknown or disallowed project reference.");
  }
  const url = `https://${projectRef}.supabase.co`;
  const configured = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured !== url && configured !== `${url}/`) {
    throw new Error("VITE_SUPABASE_URL does not match the selected project.");
  }
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for cloud commands.");
  }
  return { projectRef, kind: TARGETS[projectRef], url, serviceKey };
}

/** Management API token from the environment, else the Supabase CLI login file. */
export function managementToken(env = process.env, readFile = fs.readFileSync) {
  const fromEnv = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  if (fromEnv) return fromEnv;
  let fromFile = "";
  try {
    fromFile = String(readFile(`${os.homedir()}/.supabase/access-token`, "utf8")).trim();
  } catch {
    fromFile = "";
  }
  if (!fromFile) {
    throw new Error("A Supabase access token is required for SQL (SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token).");
  }
  return fromFile;
}

/** Returns runSql(query) that posts SQL to the project's Management API and resolves to the row array. */
// HTTP 429 comes from the API throttler before the query runs, so the same request is retried after these waits.
export const THROTTLE_WAITS_MS = Object.freeze([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);

export function createSqlRunner(projectRef, { token, fetcher = fetch, waits = THROTTLE_WAITS_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  return async function runSql(query) {
    const send = () => fetcher(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SQL_TIMEOUT_MS),
    });
    let response = await send();
    for (const wait of waits) {
      if (response.status !== 429) break;
      await sleep(wait);
      response = await send();
    }
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.message === "string") message = parsed.message;
      } catch {
        // Non-JSON error bodies are shown as text.
      }
      // Redact before truncating so a token cannot survive as a partial prefix.
      const safe = token ? message.split(token).join("[redacted]") : message;
      throw new Error(`SQL failed (HTTP ${response.status}): ${safe.slice(0, MAX_ERROR_CHARS)}`);
    }
    return response.json();
  };
}

/** Dollar-quoted SQL literal whose random tag cannot occur inside the value. */
export function sqlLiteral(value) {
  let tag;
  do {
    tag = `$edra_${randomBytes(8).toString("hex")}$`;
  } while (value.includes(tag));
  return `${tag}${value}${tag}`;
}

export function jsonLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}
