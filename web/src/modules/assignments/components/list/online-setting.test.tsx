// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const actions = vi.hoisted(() => ({ load: vi.fn(), change: vi.fn() }));
vi.mock("../../actions", () => ({ loadOnlineSetting: actions.load, changeOnlineSetting: actions.change }));
import { InPersonOnlineSetting } from "./online-setting";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("waits for the command and refreshed version before accepting another change", async () => {
  let resolve!: (value: { ok: true }) => void;
  const response = new Promise<{ ok: true }>((done) => { resolve = done; });
  actions.load.mockResolvedValueOnce({ ok: true, enabled: false, version: 1 })
    .mockResolvedValueOnce({ ok: true, enabled: true, version: 2 });
  actions.change.mockReturnValue(response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><InPersonOnlineSetting academyId="academy" /></QueryClientProvider>);
  const control = screen.getByRole("switch");
  await waitFor(() => expect(control).not.toHaveProperty("disabled", true));
  fireEvent.click(control);
  fireEvent.click(control);
  expect(actions.change).toHaveBeenCalledTimes(1);
  expect(actions.change).toHaveBeenCalledWith({ academyId: "academy", enabled: true, version: 1 });
  await act(async () => resolve({ ok: true }));
  await waitFor(() => expect(control.getAttribute("aria-checked")).toBe("true"));
  await waitFor(() => expect(control).not.toHaveProperty("disabled", true));
});
