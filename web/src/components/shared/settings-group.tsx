import { SectionHeader } from "@/components/shared/section-header";

/** A titled card of settings rows, with an optional action beside the title. */
export function SettingsGroup({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader as="h2" size="base" title={title} action={action} />
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">{children}</div>
    </div>
  );
}
