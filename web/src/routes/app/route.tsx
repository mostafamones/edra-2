import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Staff authority lives at the entry and academy boundaries. */
function AppLayout() { return <Outlet />; }
export const Route = createFileRoute("/app")({ component: AppLayout });
