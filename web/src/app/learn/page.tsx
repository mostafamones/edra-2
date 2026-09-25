import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { GLOBAL_LEVELS } from "@/modules/academies";
import { getStudentProfile } from "@/modules/students/server";

export default async function LearnPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/auth/login?next=/learn");

  const { data: profile, error } = await getStudentProfile(auth.claims.sub);
  if (error) {
    return <main className="mx-auto flex min-h-svh max-w-xl items-center px-6"><p role="alert">We couldn’t load your student profile. Refresh to try again.</p></main>;
  }
  if (!profile?.level_id || !profile.parent_phone || !profile.parent_phone_verified_at) {
    redirect("/onboarding/student");
  }

  const level = GLOBAL_LEVELS.find((entry) => entry.id === profile.level_id)?.label ?? profile.level_id;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl items-center px-5 py-10 sm:px-8">
      <Card className="w-full">
        <CardHeader className="space-y-3">
          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="size-6" aria-hidden="true" /></span>
          <CardTitle className="text-2xl">You’re all set</CardTitle>
          <CardDescription>Your student account is ready.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/80 px-4 py-3">
              <p className="text-xs text-muted-foreground">Your level</p>
              <p className="mt-1 font-medium">{level}</p>
            </div>
            <div className="rounded-lg border border-border/80 px-4 py-3">
              <p className="text-xs text-muted-foreground">Parent number</p>
              <p className="mt-1 font-medium">Verified · ending in {profile.parent_phone.slice(-4)}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Your academy space will appear here once you join an academy.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild><Link href="/">Edra home</Link></Button>
            <form action="/auth/signout" method="post"><Button type="submit" variant="ghost">Sign out</Button></form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
