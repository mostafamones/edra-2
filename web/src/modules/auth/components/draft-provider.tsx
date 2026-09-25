"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

type AuthDraft = {
  phone: string;
  password: string;
};

type AuthDraftContextValue = {
  readDraft: () => AuthDraft;
  updateDraft: (changes: Partial<AuthDraft>) => void;
  clearDraft: () => void;
};

const AuthDraftContext = createContext<AuthDraftContextValue | null>(null);

export function AuthDraftProvider({ children }: { children: ReactNode }) {
  const draftRef = useRef<AuthDraft>({ phone: "", password: "" });
  const readDraft = useCallback(() => draftRef.current, []);
  const updateDraft = useCallback((changes: Partial<AuthDraft>) => {
    draftRef.current = { ...draftRef.current, ...changes };
  }, []);
  const clearDraft = useCallback(() => {
    draftRef.current = { phone: "", password: "" };
  }, []);

  const value = useMemo(() => ({ readDraft, updateDraft, clearDraft }), [readDraft, updateDraft, clearDraft]);

  return <AuthDraftContext.Provider value={value}>{children}</AuthDraftContext.Provider>;
}

export function useAuthDraft() {
  const context = useContext(AuthDraftContext);
  if (!context) throw new Error("useAuthDraft must be used within AuthDraftProvider");
  return context;
}
