import { ArrowRight, BookOpen, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const foundations = [
  {
    title: "Academy-first",
    description: "Every student, staff member, session, and result stays inside its academy.",
    icon: Users,
  },
  {
    title: "Teaching connected",
    description: "In-person operations and protected online learning share one source of truth.",
    icon: BookOpen,
  },
  {
    title: "Secure by design",
    description: "Server authorization and database policies enforce tenant isolation.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
            E
          </span>
          <span className="text-lg font-semibold tracking-tight">Edra</span>
        </div>
        <Badge variant="secondary">MVP foundation</Badge>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-20">
        <div className="max-w-3xl">
          <Badge variant="outline">Built for teacher-led academies</Badge>
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
            Run the academy.
            <span className="text-muted-foreground"> Teach without the chaos.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            Edra connects student records, sessions, attendance, assessments,
            protected lectures, and parent updates in one academy workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg">
              Begin foundation
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" size="lg">
              Build contract locked
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {foundations.map(({ title, description, icon: Icon }) => (
            <Card key={title} className="shadow-none">
              <CardHeader>
                <div className="mb-2 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{title}</CardTitle>
                <CardDescription className="leading-6">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
