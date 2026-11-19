import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { type Academy, academies } from "../../fixtures";

// Fixture stand-in for the account/academy authority. The real one (Supabase session + academy
// membership) replaces this provider; screens only read `academy` and call `select`/`signOut`.
type Session = {
  academies: Academy[];
  academy: Academy;
  select: (id: string) => void;
  signOut: () => void;
};

const Context = createContext<Session | null>(null);

export function AppSessionProvider({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const [id, setId] = useState(academies[0]!.id);
  const value = useMemo(
    () => ({ academies, academy: academies.find((a) => a.id === id)!, select: setId, signOut: onSignOut }),
    [id, onSignOut],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppSession() {
  const value = useContext(Context);
  if (!value) throw new Error("useAppSession outside AppSessionProvider");
  return value;
}
