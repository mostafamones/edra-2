import type { ReactNode } from "react";

type OnboardingFooterProps = {
  left: ReactNode;
  right?: ReactNode;
  status?: ReactNode;
};

export function OnboardingFooter({ left, right, status }: OnboardingFooterProps) {
  return (
    <footer className="sticky bottom-0 z-10 -mx-5 mt-auto px-5 py-4 backdrop-blur-sm sm:-mx-9 sm:px-9">
      {status !== undefined && <div className="mb-2 min-h-4">{status}</div>}
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div>{left}</div>
        {right !== undefined && <div className="shrink-0">{right}</div>}
      </div>
    </footer>
  );
}
