const links = [["Mobile", "/#mobile"], ["Questions", "/#questions"], ["Pricing", "/pricing"]];

export function MarketingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center justify-between gap-6 px-4 py-10 sm:px-8 lg:px-10">
        <a href="/" className="rounded-sm font-heading text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">Edra</a>
        <nav aria-label="Footer">
          <ul className="flex gap-6 text-sm text-muted-foreground">
            {links.map(([label, href]) => <li key={href}><a href={href} className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">{label}</a></li>)}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
