import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GeneralTabs } from "@/modules/navigation/components/general-tabs";

/** General settings: one title and tab bar over the profile, structure, enrollment pages. */
function Layout() {
  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold tracking-tight">General</h1>
          <GeneralTabs />
        </div>
        <Outlet />
      </div>
    </main>
  );
}
export const Route = createFileRoute("/app/$academySlug/manage/academy")({ loader: async ({ parentMatchPromise }) => (await parentMatchPromise).loaderData, shouldReload: ({ cause }) => cause !== "stay", component: Layout });
