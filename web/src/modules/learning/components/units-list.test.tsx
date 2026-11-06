// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { unitListParams } from "../params";
import { UnitsList } from "./units-list";

vi.mock("@/lib/navigation", () => ({ usePathname: () => "/courses", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/content/student-cards", () => ({
  COURSE_ROWS: "",
  CourseCard: ({ unit }: { unit: { title: string } }) => <span>{unit.title}</span>,
}));

type Groups = React.ComponentProps<typeof UnitsList>["groups"];
const now = Date.parse("2026-11-06T10:00:00Z");
const groups = [{
  academy: { id: "academy", slug: "academy", name: "Academy" } as Groups[number]["academy"],
  hasMore: false,
  items: [
    { id: "expired", title: "Previously started", access: { status: "expired", expiresAt: "2026-11-05T12:00:00Z", grantId: "grant-1" }, progress: { total: 2, completed: 1, items: [{ itemId: "video", completed: true }] } },
    { id: "completed", title: "Completed with access", access: { status: "active", expiresAt: "2026-11-08T12:00:00Z", grantId: "grant-2" }, progress: { total: 1, completed: 1, items: [{ itemId: "video", completed: true }] } },
    { id: "locked", title: "Available to unlock", access: { status: "locked", expiresAt: null, grantId: null } },
  ].map(unit => ({ materialCount: 2, publishedAt: "2026-11-03T12:00:00Z", contents: [], ...unit })) as NonNullable<Groups[number]["items"]>,
}];

function open(started: boolean, query = {}) {
  const { search, view, statuses, group } = unitListParams(query);
  render(<UnitsList started={started} search={search} initialView={view} initialStatuses={statuses} initialGroup={group} groups={groups} now={now} />);
}

afterEach(cleanup);

it("shows expired and completed courses in My courses by default without including units the student hasn't unlocked", () => {
  open(true);
  expect(screen.getByText("Previously started")).toBeTruthy();
  expect(screen.getByText("Completed with access")).toBeTruthy();
  expect(screen.queryByText("Available to unlock")).toBeNull();
});

it("shows all eligible releases in Discover, including units the student already started", () => {
  open(false);
  expect(screen.getByText("Previously started")).toBeTruthy();
  expect(screen.getByText("Completed with access")).toBeTruthy();
  expect(screen.getByText("Available to unlock")).toBeTruthy();
});

it("honors explicit status filters and lets the student recover from an empty filtered result", () => {
  open(true, { status: "active" });
  expect(screen.getByText("No matching courses")).toBeTruthy();
  expect(screen.queryByText("Completed with access")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("Previously started")).toBeTruthy();
  expect(screen.getByText("Completed with access")).toBeTruthy();
});
