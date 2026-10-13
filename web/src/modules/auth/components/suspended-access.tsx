import { IconUserOff } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { staffEntryHref } from "@/lib/routing";

/**
 * Shown to a staff member whose access to an academy is suspended. Suspension is academy-scoped:
 * the account stays signed in, and other active academies remain available.
 */
export function SuspendedAccess({ academyName, retryHref, otherAcademies }: {
  /** Omitted on the entry page when every staff membership is suspended. */
  academyName?: string;
  retryHref: string;
  otherAcademies: boolean;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconUserOff aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>{academyName ? <>Your access to <span dir="auto">{academyName}</span> is suspended</> : "Your staff access is suspended"}</EmptyTitle>
          <EmptyDescription>
            An academy manager has temporarily suspended your staff access. Your Edra account
            {otherAcademies ? " and your other academies are" : " is"} not affected. Ask the academy to restore your access.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          {otherAcademies && <Button asChild><a href={staffEntryHref()}>Choose another academy</a></Button>}
          <Button variant="outline" asChild><a href={retryHref}>Check again</a></Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
