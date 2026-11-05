import type { ReactNode } from "react";
export const useAuth = () => ({ user: { id: "preview-staff" } });
export const AcademyGate = ({ children }: { children: (academy: { id: string; name: string }) => ReactNode }) => children({ id: "preview-academy", name: "Mones Academy · أكاديمية مونس" });
