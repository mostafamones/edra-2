import type { ReactNode } from "react";
export const useAuth = () => ({ user: { id: "preview-staff" } });
export const AcademyGate = ({ children }: { children: (academy: { id: string }) => ReactNode }) => children({ id: "preview-academy" });
