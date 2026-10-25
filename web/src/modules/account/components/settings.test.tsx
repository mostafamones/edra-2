// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  profile: {
    profile: { fullName: "Sara Hassan", displayName: "Sara", avatarPath: null } as { fullName: string | null; displayName: string | null; avatarPath: string | null } | null,
    name: "Sara" as string | null,
    avatarUrl: undefined as string | undefined,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  contacts: {
    data: { loginPhone: "+201012345678", parentPhone: null, operations: [] } as { loginPhone: string | null; parentPhone: string | null; operations: never[] } | undefined,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: state.user }),
  resetPasswordSchema: z.object({ password: z.string(), confirmPassword: z.string() }),
}));
vi.mock("@/modules/development", () => ({ usePreviewStatus: () => ({ data: undefined }) }));
vi.mock("../actions", () => ({ saveProfile: vi.fn(), uploadAvatar: vi.fn(), removeAvatar: vi.fn(), deleteAccount: vi.fn() }));
vi.mock("../queries", () => ({
  accountQueryKeys: {
    all: ["account"] as const,
    profile: (userId: string) => ["account", "profile", userId] as const,
    avatar: (path: string) => ["account", "avatar", path] as const,
    contacts: (userId: string, sessionId: string) => ["account", "contacts", userId, sessionId] as const,
  },
  useAccountProfile: () => state.profile,
  useAccountContacts: () => state.contacts,
}));

import { AccountSettings } from "./settings";

afterEach(cleanup);

function mount() {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><AccountSettings /></QueryClientProvider>);
}

describe("AccountSettings", () => {
  it("keeps the full page in skeleton state while contacts are still loading after profile resolves", () => {
    state.profile = {
      profile: { fullName: "Sara Hassan", displayName: "Sara", avatarPath: null },
      name: "Sara",
      avatarUrl: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    state.contacts = { data: undefined, error: null, refetch: vi.fn() };

    mount();
    expect(screen.getByRole("status", { name: "Loading account settings" })).toBeTruthy();
    expect(screen.queryByText("Profile")).toBeNull();
    expect(screen.queryByText("Phone")).toBeNull();
    expect(screen.queryByText("Security")).toBeNull();
  });

  it("renders Profile, Phone, and Security together once both profile and contacts are loaded", () => {
    state.contacts = {
      data: { loginPhone: "+201012345678", parentPhone: "+201112345678", operations: [] },
      error: null,
      refetch: vi.fn(),
    };

    mount();
    expect(screen.queryByRole("status", { name: "Loading account settings" })).toBeNull();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.getByText("Account phone")).toBeTruthy();
    expect(screen.getByText("Parent phone")).toBeTruthy();
    expect(screen.getByText("Security")).toBeTruthy();
  });

  it("shows an error alert and retries the failed query when contacts fail to load", () => {
    const refetchContacts = vi.fn();
    state.contacts = { data: undefined, error: new Error("failed"), refetch: refetchContacts };

    mount();
    expect(screen.getByText("Couldn’t load your phone numbers.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchContacts).toHaveBeenCalledOnce();
  });
});
