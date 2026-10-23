"use client";

import { AcademyGate } from "@/modules/auth";
import { GroupsBoard } from "./board";

export function GroupsPage() {
  return (
    <AcademyGate>
      {(academy) => (
        <main className="page-shell">
          <GroupsBoard academy={academy} title={<h1 className="text-2xl font-bold tracking-tight">Groups</h1>} />
        </main>
      )}
    </AcademyGate>
  );
}
