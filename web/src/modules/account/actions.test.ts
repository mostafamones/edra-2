import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "9a111111-1111-4111-8111-111111111111";
const OLD = `${USER}/9c111111-1111-4111-8111-111111111111.webp`;

type Fake = {
  current: string | null;
  rpc: { data?: unknown; error?: { code: string } | null };
  upload: { error: { message: string } | null };
  listed: { name: string; created_at: string }[];
  removed: string[][];
  uploaded: string[];
  /** Reads of the profile after the first (the pre-upload read) fail or return `afterSwitch`. */
  reread?: "fail" | "committed";
  reads: number;
};
let fake: Fake;

function db() {
  return {
    rpc: vi.fn(async (_name: string, args: { p_path: string | null }) => {
      if (fake.rpc.data && typeof fake.rpc.data === "object" && fake.rpc.error === undefined) return { data: fake.rpc.data, error: null };
      if (fake.rpc.error) return { data: null, error: fake.rpc.error };
      return { data: { result: "saved", previous: fake.current }, error: null, args };
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            fake.reads += 1;
            if (fake.reads > 1 && fake.reread === "fail") return { data: null, error: { message: "down" } };
            if (fake.reads > 1 && fake.reread === "committed") return { data: { avatar_path: fake.uploaded[0] }, error: null };
            return { data: { avatar_path: fake.current }, error: null };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string) => {
          fake.uploaded.push(path);
          return { error: fake.upload.error };
        }),
        list: vi.fn(async () => ({ data: fake.listed, error: null })),
        remove: vi.fn(async (paths: string[]) => {
          fake.removed.push(paths);
          return { error: null };
        }),
      }),
    },
  };
}

vi.mock("../../lib/supabase/authority", () => ({ cookieAuthority: async () => ({ db: db(), userId: USER }) }));
vi.mock("./image", () => ({ encodeAvatar: async () => Buffer.from("webp") }));

const { uploadAvatar, removeAvatar } = await import("./actions");

function form(expected?: string) {
  const data = new FormData();
  data.set("file", new Blob(["x"], { type: "image/png" }));
  if (expected) data.set("expected", expected);
  return data;
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

beforeEach(() => {
  fake = { current: null, rpc: {}, upload: { error: null }, listed: [], removed: [], uploaded: [], reads: 0 };
});

describe("avatar upload lifecycle", () => {
  it("keeps the old avatar and uploads nothing permanent when the upload fails", async () => {
    fake.current = OLD;
    fake.upload = { error: { message: "boom" } };
    const result = await uploadAvatar(form(OLD));
    expect(result.ok).toBe(false);
    expect(fake.removed.flat()).not.toContain(OLD);
  });

  it("deletes the superseded object after a successful switch", async () => {
    fake.current = OLD;
    const result = await uploadAvatar(form(OLD));
    expect(result).toEqual({ ok: true, avatarPath: fake.uploaded[0] });
    expect(fake.removed.flat()).toContain(OLD);
  });

  it("removes only its own upload when it loses a concurrent change", async () => {
    fake.current = OLD;
    fake.rpc = { data: { result: "conflict", current: OLD } };
    const result = await uploadAvatar(form());
    expect(result).toMatchObject({ ok: false, avatarPath: OLD });
    expect(fake.removed.flat()).toEqual([fake.uploaded[0]]);
  });

  it("keeps the upload when the switch outcome is unknown", async () => {
    fake.rpc = { error: { code: "XX000" } };
    fake.reread = "fail";
    const result = await uploadAvatar(form());
    expect(result.ok).toBe(false);
    // Reconciliation, not this request, decides whether the object became current.
    expect(fake.removed.flat()).not.toContain(fake.uploaded[0]);
  });

  it("treats a lost response as success when the switch actually committed", async () => {
    fake.rpc = { error: { code: "XX000" } };
    fake.reread = "committed";
    const result = await uploadAvatar(form());
    expect(result).toEqual({ ok: true, avatarPath: fake.uploaded[0] });
    expect(fake.removed.flat()).not.toContain(fake.uploaded[0]);
  });

  it("deletes stale unreferenced objects and leaves recent ones", async () => {
    fake.listed = [
      { name: "9c222222-2222-4222-8222-222222222222.webp", created_at: minutesAgo(60) },
      { name: "9c333333-3333-4333-8333-333333333333.webp", created_at: minutesAgo(1) },
    ];
    await uploadAvatar(form());
    expect(fake.removed.flat()).toContain(`${USER}/9c222222-2222-4222-8222-222222222222.webp`);
    expect(fake.removed.flat()).not.toContain(`${USER}/9c333333-3333-4333-8333-333333333333.webp`);
  });

  it("refuses new uploads while three recent ones are unfinished", async () => {
    fake.listed = [1, 2, 3].map((n) => ({ name: `9c44444${n}-4444-4444-8444-444444444444.webp`, created_at: minutesAgo(1) }));
    const result = await uploadAvatar(form());
    expect(result.ok).toBe(false);
    expect(fake.uploaded).toEqual([]);
  });

  it("reports a conflicting remove without deleting the winner", async () => {
    fake.current = OLD;
    fake.rpc = { data: { result: "conflict", current: OLD } };
    const result = await removeAvatar("someone-else.webp");
    expect(result).toMatchObject({ ok: false, avatarPath: OLD });
    expect(fake.removed.flat()).not.toContain(OLD);
  });

  it("removes the previous object when the avatar is cleared", async () => {
    fake.current = OLD;
    expect(await removeAvatar(OLD)).toEqual({ ok: true, avatarPath: null });
    expect(fake.removed.flat()).toContain(OLD);
  });
});
