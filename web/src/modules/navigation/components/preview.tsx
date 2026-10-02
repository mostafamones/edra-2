import type { PagePreview } from "../manifest";

export function PagePreviewView({ preview }: { preview: PagePreview }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16 text-center sm:px-10">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Page preview</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{preview.title}</h1>
      <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
        {preview.purpose}
      </p>

      <div className="mt-12 border-t border-border/70 pt-8">
        <h2 className="text-sm font-semibold">This page will contain</h2>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
          {preview.sections.map((section) => <li key={section}>{section}</li>)}
        </ul>
      </div>

      {preview.actions?.length ? (
        <div className="mt-9 border-t border-border/70 pt-8">
          <h2 className="text-sm font-semibold">Planned actions</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
            {preview.actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
