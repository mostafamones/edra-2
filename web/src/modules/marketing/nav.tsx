import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Menu01Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { IconSchool } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { features, mobile, tools, type Entry } from "./catalog";

const menus = [
  { label: "Features", items: features, columns: "grid-cols-3 grid-rows-2" },
  { label: "Mobile", items: mobile, columns: "grid-cols-2" },
  { label: "Tools", items: tools, columns: "grid-cols-3 grid-rows-3" },
] as const;

export type NavProps = { isSignedIn: boolean; primaryHref: string; signInHref: string };

function EntryCard({ entry, compact }: { entry: Entry; compact?: boolean }) {
  return (
    <NavigationMenuLink asChild className="block h-full rounded-xl p-0 hover:bg-transparent focus:bg-transparent">
      <a href={entry.href} className="group/entry">
        <Card size="sm" className={cn("h-full gap-2 shadow-none ring-1 transition-[background-color,translate,box-shadow] duration-200 group-hover/entry:-translate-y-0.5 group-hover/entry:bg-muted/60 group-hover/entry:ring-primary/30 group-focus-visible/entry:ring-2 group-focus-visible/entry:ring-ring motion-reduce:transition-none motion-reduce:group-hover/entry:translate-y-0", compact ? "px-3" : "px-4")}>
          <span className="flex items-center justify-between gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><HugeiconsIcon icon={entry.icon} size={18} strokeWidth={1.5} aria-hidden="true" /></span>
            {entry.soon && <Badge variant="outline" className="text-[10px]">Soon</Badge>}
          </span>
          <span className="text-sm font-semibold">{entry.title}</span>
          <span className="text-xs leading-relaxed text-muted-foreground">{entry.detail}</span>
        </Card>
      </a>
    </NavigationMenuLink>
  );
}

/** Public site header. Every menu opens in one shared, centred panel that slides between menus. */
export function MarketingNav({ isSignedIn, primaryHref, signInHref }: NavProps) {
  const primaryLabel = isSignedIn ? "Go to app" : "Get started";
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[76rem] items-center justify-between gap-4 px-4 sm:px-8 lg:px-10">
        <a href="/" aria-label="Edra home" className="group/logo flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 group-hover/logo:-rotate-6 motion-reduce:transition-none">
            <IconSchool className="size-5" aria-hidden="true" />
          </span>
          <span className="font-heading text-xl font-semibold tracking-tight">Edra</span>
        </a>

        {/* The viewport wrapper spans the menu so the shared panel stays centred under it. */}
        <NavigationMenu className="hidden md:flex [&>div:last-child]:inset-x-0 [&>div:last-child>*]:shrink-0">
          <NavigationMenuList>
            {menus.map(menu => (
              <NavigationMenuItem key={menu.label}>
                <NavigationMenuTrigger className="bg-transparent">{menu.label}</NavigationMenuTrigger>
                {/* One fixed size for every menu, so the shared panel never resizes. */}
                <NavigationMenuContent className="motion-safe:duration-300 motion-safe:data-[motion=from-end]:slide-in-from-right-16 motion-safe:data-[motion=from-start]:slide-in-from-left-16 motion-safe:data-[motion=to-end]:slide-out-to-right-16 motion-safe:data-[motion=to-start]:slide-out-to-left-16 motion-safe:animate-in motion-safe:fade-in-0 md:h-[24rem] md:w-[46rem] md:p-1.5">
                  {menu.label === "Mobile" ? (
                    <div className="grid h-full grid-cols-[14rem_1fr] gap-2">
                      <NavigationMenuLink asChild className="block rounded-xl p-0 hover:bg-transparent focus:bg-transparent">
                        <a href="/#mobile" className="group/entry">
                          <Card className="relative h-full justify-end gap-2 overflow-hidden border-0 bg-primary p-5 text-primary-foreground shadow-none ring-0">
                            <HugeiconsIcon icon={SmartPhone01Icon} size={120} strokeWidth={1} className="absolute -right-6 -top-4 opacity-20 transition-transform duration-500 group-hover/entry:-rotate-6 group-hover/entry:scale-110 motion-reduce:transition-none" aria-hidden="true" />
                            <span className="font-heading text-lg font-semibold">The instructor companion</span>
                            <span className="text-xs leading-relaxed opacity-80">Sessions, attendance and marking on iPhone.</span>
                            <span className="mt-2 flex items-center gap-1 text-xs font-medium">See it<HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} className="transition-transform group-hover/entry:translate-x-0.5" aria-hidden="true" /></span>
                          </Card>
                        </a>
                      </NavigationMenuLink>
                      <ul className="grid grid-cols-2 grid-rows-3 gap-2">{menu.items.map(entry => <li key={entry.title}><EntryCard entry={entry} compact /></li>)}</ul>
                    </div>
                  ) : (
                    <ul className={cn("grid h-full gap-2", menu.columns)}>
                      {menu.items.map(entry => <li key={entry.title}><EntryCard entry={entry} compact={menu.label === "Tools"} /></li>)}
                    </ul>
                  )}
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={cn(navigationMenuTriggerStyle(), "bg-transparent")}><a href="/pricing">Pricing</a></NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-1 sm:gap-2">
          {!isSignedIn && <Button asChild variant="ghost" className="hidden sm:inline-flex"><a href={signInHref}>Sign in</a></Button>}
          <Button asChild className="group/cta gap-1.5">
            <a href={primaryHref}>{primaryLabel}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="transition-transform group-hover/cta:translate-x-0.5" aria-hidden="true" /></a>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu"><HugeiconsIcon icon={Menu01Icon} strokeWidth={1.5} aria-hidden="true" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader><SheetTitle>Edra</SheetTitle></SheetHeader>
              <nav aria-label="Main navigation" className="flex flex-col gap-6 px-4 pb-8">
                {menus.map(menu => (
                  <div key={menu.label} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{menu.label}</p>
                    <ul className="space-y-1">{menu.items.map(entry => (
                      <li key={entry.title}><a href={entry.href} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted">
                        <HugeiconsIcon icon={entry.icon} size={18} strokeWidth={1.5} className="text-primary" aria-hidden="true" />{entry.title}
                        {entry.soon && <Badge variant="outline" className="ml-auto text-[10px]">Soon</Badge>}
                      </a></li>
                    ))}</ul>
                  </div>
                ))}
                <a href="/pricing" className="rounded-lg p-2 text-sm font-medium hover:bg-muted">Pricing</a>
                {!isSignedIn && <a href={signInHref} className="rounded-lg p-2 text-sm font-medium hover:bg-muted">Sign in</a>}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
