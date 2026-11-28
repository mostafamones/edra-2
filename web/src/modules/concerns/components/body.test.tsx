// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/modules/staff", async (original) => ({ ...await original<typeof import("@/modules/staff")>(), fetchTeamMembers: vi.fn(async () => [{ user_id: "b", role: "admin" }]) }));
const { ConcernBody, splitMentions } = await import("./body");
afterEach(cleanup);

const mona = { userId: "a", name: "Mona" }, monaLee = { userId: "c", name: "Mona Lee" }, omar = { userId: "b", name: "Omar" };
it("splits only recorded mentions, preferring the longest name and requiring a word end", () => {
  expect(splitMentions("hi @Mona Lee and @Mona, @Monas", [mona, monaLee])).toEqual(["hi ", monaLee, " and ", mona, ", @Monas"]);
  expect(splitMentions("hi @Omar", [mona])).toEqual(["hi @Omar"]);
  expect(splitMentions("x", [])).toEqual(["x"]);
});

it("renders a mention badge that opens the person's card with their role", async () => {
  render(<QueryClientProvider client={new QueryClient()}><ConcernBody body="ping @Omar see https://x.test" mentions={[omar]} scope={{ academyId: "ac", userId: "a" }} /></QueryClientProvider>);
  expect(screen.getByRole("link", { name: "https://x.test" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "@Omar" }));
  expect(await screen.findByText("Admin")).toBeTruthy();
});
