import Link from "@/components/shared/link";
import { IconSchool } from "@/components/shared/icons";
import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/auth")({ component: AuthLayout });

import { AuthDraftProvider } from "@/modules/auth/components/draft-provider";

function AuthLayout() {
  return (
    <AuthDraftProvider>
      <main className="grid min-h-svh lg:grid-cols-2">
        <section className="flex min-h-svh flex-col px-6 py-8 sm:px-10 lg:px-14">
          <Link href="/" className="inline-flex w-fit items-center gap-2 font-semibold" aria-label="Edra home">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <IconSchool className="size-5" aria-hidden="true" />
            </span>
            Edra
          </Link>
          <div className="mx-auto flex w-full max-w-sm flex-1 items-center py-12">
            <div className="w-full"><Outlet /></div>
          </div>
        </section>
        <aside className="hidden bg-muted lg:block" aria-label="Reserved for Edra artwork" />
      </main>
    </AuthDraftProvider>
  );
}
