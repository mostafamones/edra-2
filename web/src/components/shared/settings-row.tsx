import { Label } from "@/components/ui/label";

/** A settings row: title and description on the left, its control on the right. */
export function SettingsRow({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-6 px-6 py-5">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id} className="font-medium">{title}</Label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
