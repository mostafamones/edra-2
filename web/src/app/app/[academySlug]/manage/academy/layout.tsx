import { GeneralTabs } from "@/modules/navigation/components/general-tabs";

/** General settings: one title and tab bar over the profile, structure, enrollment pages. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold tracking-tight">General</h1>
          <GeneralTabs />
        </div>
        {children}
      </div>
    </main>
  );
}
