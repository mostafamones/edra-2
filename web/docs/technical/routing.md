# Routing

Source-checked against src/lib/routing/index.ts, src/proxy.ts and current route files. No deployment/browser verification is claimed.

## Origins and public paths

One Next.js application serves marketing, staff and student hosts. Configure NEXT_PUBLIC_EDRA_MARKETING_ORIGIN, NEXT_PUBLIC_EDRA_APP_ORIGIN and NEXT_PUBLIC_EDRA_LEARN_ORIGIN with matching EDRA_* server values. Production requires three distinct explicit HTTPS origins; server/browser values must agree.

Development defaults are lvh.me:3000, app.lvh.me:3000 and learn.lvh.me:3000. NEXT_PUBLIC_EDRA_COOKIE_DOMAIN defines the trusted parent-cookie domain. Keep public/server values aligned and rebuild when public values change. Unknown hosts are rejected; proxy rewrites remain on the internal request origin.

| Surface | Public path | Source namespace |
|---|---|---|
| Marketing | / on marketing host | src/app/page.tsx |
| Staff entry | / on staff host | src/app/app/page.tsx |
| Academy staff | /<slug> | src/app/app/[academySlug]/ |
| Students/imports, groups, schedules | /<slug>/students, /groups, /schedules and their concrete subroutes | Same feature folders under the academy |
| Assignments | /<slug>/assignments, /new, /<id>, /<id>/edit | Concrete assignment routes |
| Sessions/attendance | /<slug>/attendance, /new, /<id> | Concrete attendance routes; legacy detail suffix redirects |
| Team/codes | /<slug>/manage/team, /manage/student-codes | Concrete management routes |
| Student global area | / and supported global paths on student host | src/app/learn/ |
| Student academy area | /<slug>/<path> on student host | src/app/learn/academy/[academySlug]/[[...path]]/ |
| Authentication/setup | /auth/* and /onboarding/* | Existing authentication/onboarding files |
| HTTP API | /api/* | No page rewrite; existing handlers authorize independently |

A catch-all navigation destination is not proof its product workflow is implemented. Inspect its page and domain before claiming it as a working feature. The student-academy route exists but academy enrollment authority must be implemented/verified before calling it accessible.

## URL and authority rules

Use the routing public API for canonical links and allowlisted return destinations. Host descriptors never establish membership. Resolve academy authority independently; switching academies must discard source record IDs and filters.

Production domains, DNS and preview-cookie trust remain environment setup. Do not invent an owned domain from fixtures or trust forwarded hosts for public links. Current host classification also accepts the configured development tunnel mones.ddns.net:3000; verify the intended API origin against this source before native setup.
