"use client";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";

import { canViewInvitations } from "../permissions";
import { TeamMembers } from "./members";

export function TeamPage() {
  return (
    <AcademyGate>
      {(academy) => <Team academy={academy} />}
    </AcademyGate>
  );
}

function Team({ academy }: { academy: AcademyEntry }) {
  useBreadcrumbTitle("Team");
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const canManage = canViewInvitations(academy.role);
  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <TeamMembers academy={academy} userId={userId} canManage={canManage} />
      </div>
    </main>
  );
}
