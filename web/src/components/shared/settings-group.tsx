/** A titled card of settings rows. */
export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base px-2 font-semibold text-foreground/80">{title}</h2>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">{children}</div>
    </div>
  );
}
