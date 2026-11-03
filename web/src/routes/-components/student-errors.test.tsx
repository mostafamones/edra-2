// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/exams", () => ({ StudentExamsError: ({ retry }: { retry: () => void }) => <button onClick={retry}>Retry</button> }));
import { ExamsRouteError, UnitRouteError } from "./student-errors";
afterEach(() => { cleanup(); refresh.mockClear(); });

it.each([["exams", ExamsRouteError], ["unit", UnitRouteError]] as const)("%s retry reloads the failed loader", (_, Component) => {
  render(<Component />);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(refresh).toHaveBeenCalledOnce();
});
