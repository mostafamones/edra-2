import type { ReactNode } from "react";
import Link from "next/link";
import { IconCalendarDue } from "@tabler/icons-react";

import { Card } from "@/components/ui/card";

type Props = {
  href: string;
  title: string;
  /** Under the title: audience, marks, timer. */
  meta: string;
  badge: ReactNode;
  questions: number;
  submitted: number;
  /** Students still answering online. */
  answering: number;
  announced: number;
  /** The online window, or null when there is none. */
  window: { opens: ReactNode; closes: ReactNode } | null;
};

/** One quiz or exam in a list; the whole card opens its workspace. */
export function AssessmentCard({ href, title, meta, badge, questions, submitted, answering, announced, window }: Props) {
  return (
    <Card size="sm" className="relative gap-0 rounded-lg ring-0 py-0 transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/30">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {/* The link stretches over the card so the whole card is one target. */}
          <Link href={href} className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg">{title}</Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
        </div>
        {badge}
      </div>
      <dl className="grid grid-cols-3 divide-x border-t border-border/70 text-center">
        {[
          { label: "Questions", value: questions },
          { label: "Submitted", value: submitted, note: answering > 0 ? `${answering} answering` : undefined },
          { label: "Announced", value: announced },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5 px-2 py-3">
            <dd className="order-first text-lg leading-none font-semibold tabular-nums">{stat.value}</dd>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            {stat.note && <span className="text-[11px] text-muted-foreground">{stat.note}</span>}
          </div>
        ))}
      </dl>
      <div className="flex items-start gap-2.5 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
        <IconCalendarDue className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {window ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <span>Opens</span><span className="text-foreground">{window.opens}</span>
            <span>Closes</span><span className="text-foreground">{window.closes}</span>
          </div>
        ) : <span>No online window</span>}
      </div>
    </Card>
  );
}
