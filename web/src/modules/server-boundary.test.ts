import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src/modules");
const files = readdirSync(root, { recursive: true, encoding: "utf8" })
  .map((file) => join(root, file)).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
const read = (file: string) => readFileSync(file, "utf8");
const implementations = files.filter((file) => /(actions|labels)\.server\.ts$/.test(file));

describe("module server boundaries", () => {
  it("found the 33 action modules", () => expect(implementations).toHaveLength(33));

  it.each(implementations.map((file) => relative(root, file)))("%s has one static endpoint per action and no server value re-export", (file) => {
    const server = read(join(root, file));
    const wrapper = read(join(root, file.replace(".server.ts", ".ts")));
    const actions = [...server.matchAll(/^export async function (\w+)/gm)].map((match) => match[1]);
    expect(actions.length).toBeGreaterThan(0);
    expect(server).toMatch(/^import "@tanstack\/react-start\/server-only";/);
    for (const action of actions) {
      expect(wrapper).toMatch(new RegExp(`const ${action}Fn = createServerFn\\(\\{ method: "POST"`));
      expect(wrapper).toMatch(new RegExp(`export async function ${action}\\b`));
    }
    expect(wrapper).not.toMatch(/^export \{[^}]*\} from "\.\/[^"]*\.server"/m);
    expect(wrapper).not.toMatch(/^export \* from/m);
    // A generic dispatcher would look its target up by a name supplied at runtime.
    expect(wrapper).not.toMatch(/\[(data\.)?(name|action|fn|method)\]\(/);
  });

  it("keeps Next imports, removed directives and the native codec out of module runtime code", () => {
    for (const file of files) expect(read(file), file).not.toMatch(/from ["']next(\/|["'])|^["']use (server|client)["']|from ["'](server-only|sharp)["']/m);
  });

  it("keeps secrets in server-only files", () => {
    const secret = /process\.env\.(?!NODE_ENV\b)[A-Z_]+/;
    for (const file of files.filter((file) => secret.test(read(file)))) {
      expect(read(file), file).toMatch(/^import "@tanstack\/react-start\/server-only";/m);
    }
  });
});
