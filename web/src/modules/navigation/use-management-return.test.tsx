// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

import { managementReturnPath, useManagementReturn } from "./use-management-return";

const slug = "edra-dev-abc";
afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState(null, "", "/"); });

describe("settings return navigation", () => {
  it("remembers the filtered workspace page through settings navigation and a remount", () => {
    window.history.replaceState(null, "", `/${slug}/students?q=ali&page=2`);
    const { result, rerender, unmount } = renderHook(({ path, management }) => useManagementReturn(slug, path, management), {
      initialProps: { path: "/app/students", management: false },
    });
    window.history.replaceState(null, "", `/${slug}/manage/account`);
    rerender({ path: "/app/manage/account", management: true });
    window.history.replaceState(null, "", `/${slug}/manage/general`);
    rerender({ path: "/app/manage/general", management: true });
    expect(result.current()).toBe(`/${slug}/students?q=ali&page=2`);
    unmount();
    const restored = renderHook(() => useManagementReturn(slug, "/app/manage/general", true));
    expect(restored.result.current()).toBe(`/${slug}/students?q=ali&page=2`);
  });

  it("remembers query-only changes before entering settings", () => {
    window.history.replaceState(null, "", `/${slug}/students?page=1`);
    const { result, rerender } = renderHook(() => useManagementReturn(slug, "/app/students", false));
    window.history.replaceState(null, "", `/${slug}/students?page=3`);
    rerender();
    expect(result.current()).toBe(`/${slug}/students?page=3`);
  });

  it.each([null, "/other/students", `/${slug}/manage`, `/${slug}/manage/account`, "https://evil.test/page", "//evil.test/page", `/${slug}-other/students`])("falls back safely for %s", (path) => {
    expect(managementReturnPath(slug, path)).toBe(`/${slug}`);
  });

  it("does not reuse another academy's return page", () => {
    sessionStorage.setItem(`edra:management-return:${slug}`, `/${slug}/students`);
    const { result } = renderHook(() => useManagementReturn("other", "/app/manage/account", true));
    expect(result.current()).toBe("/other");
  });
});
