import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getStudentProfile } from "@/modules/students/server";

const membershipsSchema = z.array(z.object({
  academy_id: z.uuid(),
  role: z.enum(["owner", "admin", "instructor"]),
  academies: z.object({
    name: z.string(),
    slug: z.string(),
  }),
}));

export default async function AppHomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/app");

  const { data: membershipRows, error } = await supabase
    .from("academy_memberships")
    .select("academy_id, role, academies!inner(name, slug)")
    .eq("user_id", data.claims.sub);
  const parsedMemberships = membershipsSchema.safeParse(membershipRows ?? []);
  const memberships = !error && parsedMemberships.success ? parsedMemberships.data : [];

  // Staff keep their instructor workspace even if they also use Edra as a student.
  if (!error && parsedMemberships.success && memberships.length === 0) {
    const { data: student, error: studentError } = await getStudentProfile(data.claims.sub);
    if (!studentError && student?.level_id && student.parent_phone_verified_at) {
      redirect("/learn");
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Welcome to Edra</CardTitle>
          <CardDescription>
            {memberships.length > 0 ? "Your academy setup is ready." : "Start shaping your academy space."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">We couldn’t load your academies. Refresh to try again.</p>
          ) : memberships.length > 0 ? (
            <div className="space-y-2">
              {memberships.map(({ academy_id, role, academies }) => (
                <div key={academy_id} className="rounded-lg border border-border/70 px-4 py-3">
                  <p className="font-medium">{academies.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    edra.academy/{academies.slug} <span aria-hidden="true">·</span> {role}
                  </p>
                </div>
              ))}
            </div>
          ) : parsedMemberships.success ? (
            <Button asChild><Link href="/onboarding">Get started</Link></Button>
          ) : (
            <p role="alert" className="text-sm text-destructive">We couldn’t read your academy details. Refresh to try again.</p>
          )}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
