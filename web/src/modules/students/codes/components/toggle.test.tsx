// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { StudentCodeSettings } from "../types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({ saveStudentCodeSettings: save }));
vi.mock("@/modules/auth/components/provider", () => ({ useAuth: () => ({ activeAcademy: { id: "academy" }, user: { id: "actor" } }) }));
import { StudentCodesToggle } from "./toggle";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("invalidates the captured academy's student list when save finishes after unmount", async () => {
  let resolve!: (value: { ok: true; data: { version: number } }) => void;
  save.mockReturnValue(new Promise(done => { resolve = done; }));
  const client = new QueryClient(), saved = vi.fn();
  const key = ["students", "academy", "list", { page: 1 }], other = ["students", "other", "list"];
  client.setQueryData(key, { rows: [] }); client.setQueryData(other, { rows: [] });
  const settings: StudentCodeSettings = { enabled: false, version: 1, defaultPattern: null, levels: [] };
  const view = render(<QueryClientProvider client={client}><StudentCodesToggle academyId="academy" settings={settings} onSaved={saved} onStale={vi.fn()} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("switch"));
  expect(save).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => { resolve({ ok: true, data: { version: 2 } }); });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  expect(saved).not.toHaveBeenCalled();
});
