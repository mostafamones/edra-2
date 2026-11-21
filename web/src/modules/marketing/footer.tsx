import { features, mobile, tools } from "./catalog";

const columns = [["Features", features], ["Mobile", mobile], ["Tools", tools]] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-[76rem] gap-10 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-10">
        <div className="space-y-2">
          <a href="/" className="rounded-sm font-heading text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">Edra</a>
          <p className="text-sm text-muted-foreground"><a href="/pricing" className="hover:text-foreground">Pricing</a></p>
        </div>
        {columns.map(([label, entries]) => (
          <nav key={label} aria-label={label} className="space-y-3">
            <p className="text-sm font-semibold">{label}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {entries.map(entry => <li key={entry.title}><a href={entry.href} className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">{entry.title}</a></li>)}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
