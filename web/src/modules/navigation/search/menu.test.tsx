// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useImperativeHandle, type Ref } from "react";
const mocks = vi.hoisted(() => ({ search: vi.fn(), push: vi.fn(), closeMobile: vi.fn(), auth: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/academy", useRouter: () => ({ push: mocks.push }) }));
vi.mock("./actions", () => ({ searchAcademy: mocks.search }));
vi.mock("@/modules/auth", () => ({ useAuth: mocks.auth }));
vi.mock("@/components/ui/sidebar", () => ({ useSidebar: () => ({ setOpenMobile: mocks.closeMobile }) }));
vi.mock("@/modules/sessions", () => ({ StartSessionCommand: function FakeSessionCommand({ onBack, onBusyChange, ref }: { onBack: () => void; onBusyChange: (busy: boolean) => void; ref?: Ref<{ back: () => void }> }) {
  useImperativeHandle(ref, () => ({ back: onBack }));
  return <><button onClick={onBack}>Back to search</button><button onClick={() => onBusyChange(true)}>Start test request</button><button onClick={() => onBusyChange(false)}>Finish test request</button></>;
} }));
import { SearchMenu } from "./menu";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: "user" }, loading: false, activeAcademy: { id: "academy-id", name: "Academy", slug: "academy", role: "admin" } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  mocks.search.mockResolvedValue({ ok: true, value: { userId: "user", academyId: "academy-id", scope: "Academy · 2026–2027", unavailable: [], groups: [{ label: "Students", records: [{ id: "nour", title: "Nour Online", detail: "Secondary · Science", path: "students?record=nour" }] }] } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() {
  render(<QueryClientProvider client={new QueryClient()}><SearchMenu platform="staff" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Search and commands" }));
}
it("opens a focused searchable menu from the visible button", async () => {
  open(); const input = await screen.findByRole("combobox", { name: "Search Edra" });
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(screen.getByRole("dialog")).toBeTruthy(); expect(mocks.search).not.toHaveBeenCalled();
});
it("opens and toggles with Ctrl+K inside a field while preserving typed slash", async () => {
  render(<QueryClientProvider client={new QueryClient()}><input aria-label="Other input" /><SearchMenu platform="staff" /></QueryClientProvider>);
  fireEvent.keyDown(screen.getByLabelText("Other input"), { key: "/" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(screen.getByLabelText("Other input"), { key: "k", ctrlKey: true }); expect(await screen.findByRole("dialog")).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true }); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.keyDown(document.body, { key: "k", metaKey: true }); expect(await screen.findByRole("dialog")).toBeTruthy();
});
it("drills into Start session without navigating, and can return to search", async () => {
  open(); fireEvent.change(await screen.findByRole("combobox", { name: "Search Edra" }), { target: { value: "start session" } });
  fireEvent.click(await screen.findByRole("option", { name: /Start session/ }));
  expect(await screen.findByRole("button", { name: "Back to search" })).toBeTruthy();
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Back to search" }));
  expect(await screen.findByRole("combobox", { name: "Search Edra" })).toBeTruthy();
});
it("blocks dismissal shortcuts while a session start is pending", async () => {
  open(); fireEvent.click(await screen.findByRole("option", { name: /Start session/ }));
  fireEvent.click(screen.getByRole("button", { name: "Start test request" }));
  fireEvent.keyDown(document.body, { key: "Escape" });
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  expect(screen.getByRole("dialog")).toBeTruthy(); expect(screen.queryByRole("button", { name: /^Close$/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Finish test request" }));
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("uses Escape to go back one step before closing the root menu", async () => {
  open(); fireEvent.change(await screen.findByRole("combobox", { name: "Search Edra" }), { target: { value: "start" } });
  fireEvent.click(await screen.findByRole("option", { name: /Start session/ }));
  fireEvent.keyDown(document.body, { key: "Escape" });
  const input = await screen.findByRole("combobox", { name: "Search Edra" });
  expect((input as HTMLInputElement).value).toBe("start");
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("discards the open workflow when the signed-in identity changes", async () => {
  const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}><SearchMenu platform="staff" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Search and commands" }));
  fireEvent.click(await screen.findByRole("option", { name: /Start session/ }));
  mocks.auth.mockReturnValue({ user: { id: "other" }, activeAcademy: { id: "other-academy", slug: "other-academy", role: "admin" }, loading: false });
  view.rerender(<QueryClientProvider client={client}><SearchMenu platform="staff" /></QueryClientProvider>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.push).not.toHaveBeenCalled();
});
it("opens an actual student result and closes the mobile sidebar", async () => {
  open(); fireEvent.change(await screen.findByRole("combobox", { name: "Search Edra" }), { target: { value: "Nour" } });
  fireEvent.click(await screen.findByRole("option", { name: /Nour Online/ }));
  expect(mocks.push).toHaveBeenCalledWith("/academy/students?record=nour"); expect(mocks.closeMobile).toHaveBeenCalledWith(false);
});
it("keyboard selection opens the existing create form without creating a record", async () => {
  open(); const input = await screen.findByRole("combobox", { name: "Search Edra" });
  fireEvent.change(input, { target: { value: "create assignment" } });
  await screen.findByRole("option", { name: /Create assignment/ });
  fireEvent.keyDown(input, { key: "ArrowDown" }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining("/academy/assignments/new")));
});
it("does not display records returned for another signed-in identity", async () => {
  mocks.search.mockResolvedValue({ ok: true, value: { userId: "other", academyId: "academy-id", groups: [{ label: "Students", records: [{ id: "private", title: "Private student", detail: "", path: "students" }] }], unavailable: [] } });
  open(); fireEvent.change(await screen.findByRole("combobox", { name: "Search Edra" }), { target: { value: "Private" } });
  expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.queryByRole("option", { name: /Private student/ })).toBeNull();
});
