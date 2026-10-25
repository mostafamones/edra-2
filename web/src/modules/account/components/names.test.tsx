// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ save: vi.fn(), preview: vi.fn() }));
vi.mock("../actions", () => ({ saveProfile: api.save }));
vi.mock("@/modules/development", () => ({ PREVIEW_STATUS_KEY: ["development", "preview-status"] }));
vi.mock("@/modules/auth", () => ({ useAuth: vi.fn() }));

import { PREVIEW_STATUS_KEY } from "@/modules/development";
import { ProfileNames } from "./names";

function PreviewLabel() {
  const query = useQuery({ queryKey: [...PREVIEW_STATUS_KEY, "staff"], queryFn: api.preview, initialData: "Old account", staleTime: Infinity });
  return <output aria-label="Preview name">{query.data}</output>;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PreviewLabel /><ProfileNames userId="staff" profile={{ fullName: "Old account", displayName: null, avatarPath: null }} /></QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it.each([
  ["Full name", "Updated account", "Updated account", null],
  ["Display name", "Nickname", "Old account", "Nickname"],
])("refreshes preview labels after saving %s", async (label, value, fullName, displayName) => {
  api.save.mockResolvedValue({ ok: true, fullName, displayName });
  api.preview.mockResolvedValue(displayName ?? fullName);
  mount();
  expect(api.preview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: label! }), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByLabelText("Preview name").textContent).toBe(displayName ?? fullName));
  expect(api.preview).toHaveBeenCalledOnce();
});

it("keeps preview labels unchanged when the profile save fails", async () => {
  api.save.mockResolvedValue({ ok: false, message: "Could not save profile." });
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Full name" }), { target: { value: "Unsaved name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Preview name").textContent).toBe("Old account");
  expect(api.preview).not.toHaveBeenCalled();
});
