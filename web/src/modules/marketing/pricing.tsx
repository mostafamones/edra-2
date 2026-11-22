import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { features, mobile, tools } from "./catalog";
import { MarketingFooter } from "./footer";
import { MarketingNav, type NavProps } from "./nav";

const included = [...features, ...mobile, ...tools].filter(entry => !entry.soon).map(entry => entry.title);

// shortcut: placeholder until the owner sets plans and prices; replace this page's content when they do.
export function MarketingPricing(props: NavProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav {...props} />
      <main className="mx-auto w-full max-w-[76rem] px-4 py-16 sm:px-8 sm:py-24 lg:px-10">
        <h1 className="text-center font-heading text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-none tracking-[-0.05em] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">Pricing</h1>
        <Card className="mx-auto mt-12 max-w-2xl gap-6 p-6 shadow-xl shadow-primary/10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 motion-safe:delay-150 motion-safe:duration-700 motion-safe:fill-mode-both sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-2xl font-semibold">Early access</h2>
            <Badge>Everything included</Badge>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {included.map(title => <li key={title} className="flex items-center gap-2 text-sm"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.5} className="text-primary" aria-hidden="true" />{title}</li>)}
          </ul>
          <Button asChild size="lg" className="group/cta gap-1.5 self-start">
            <a href={props.primaryHref}>{props.isSignedIn ? "Go to app" : "Get started"}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="transition-transform group-hover/cta:translate-x-0.5" aria-hidden="true" /></a>
          </Button>
        </Card>
      </main>
      <MarketingFooter />
    </div>
  );
}
