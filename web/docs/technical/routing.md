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
| Assessments | /<slug>/assessments | One staff list of assignments, quizzes and exams (src/app/app/[academySlug]/assessments/); list state in `type`, `q`, `audience`, `level`, `track`, `groupId`, `statuses`, `sort`, `group`, `page`; always the active academic year |
| Assignments, quizzes, exams | /<slug>/assignments, /quizzes, /exams and their /new, /<id>, /<id>/edit | Concrete type routes. The bare lists redirect to /<slug>/assessments?type=assignment, quiz or exam |
| Staff content | /<slug>/content, /content/<id> | Library (status tabs include Published) and unit editor |
| Sessions/attendance | /<slug>/attendance, /new, /<id> | Concrete attendance routes; legacy detail suffix redirects |
| Team/codes/profile | /<slug>/manage/team, /manage/student-codes, /manage/academy | Concrete management routes; legacy /settings/academy redirects to /manage/academy |
| Student learning | / and /courses, /discover, /assignments, /exams on student host | src/app/learn/; lists cover all academies and `?academy=<slug>` narrows one to a single academy |
| Student academy | /<slug> on student host | src/app/learn/academy/[academySlug]/[[...path]]/ shows the connected academy's details; /<slug>/courses, /discover, /assignments and /exams redirect to the shared list filtered to that academy |
| Student items | /<slug>/units/<unitId>, /<slug>/assignments/<id>, /<slug>/exams/<examId> on student host | Concrete routes under src/app/learn/academy/[academySlug]/; each item stays in its academy |
| Bookings | /<slug>/manage/bookings | Booking settings and registrations; /manage/bookings/review, /bookings/review and /settings/booking redirect here |
| Public booking | /invite/booking/<token>, /invite/booking/<token>/join on student host | Public form (signed out allowed, canonical host enforced); /join only stores the booking entry and opens academy onboarding. Built with `studentBookingHref` |
| Authentication/setup | /auth/* and /onboarding/* | Existing authentication/onboarding files |
| HTTP API | /api/* | No page rewrite; existing handlers authorize independently |

A catch-all navigation destination is not proof its product workflow is implemented. Inspect its page and domain before claiming it as a working feature. The student-academy route exists but academy enrollment authority must be implemented/verified before calling it accessible.

## URL and authority rules

Use the routing public API for canonical links and allowlisted return destinations. `studentAcademyPath(slug, path)` builds same-host student academy links; `studentListPath(section, slug?)` builds a shared student list link, filtered to one academy when given; `studentAcademyHref` builds the absolute canonical URL. Host descriptors never establish membership. Resolve academy authority independently; switching academies must discard source record IDs and filters.

Production domains, DNS and preview-cookie trust remain environment setup. Do not invent an owned domain from fixtures or trust forwarded hosts for public links. Outside production, the optional server-only EDRA_DEV_TUNNEL_HOST adds one exact host[:port] (for example mones.ddns.net:3000) as a staff-host alias for a phone-reachable development tunnel. It is unset by default, compared case-insensitively with no wildcard or suffix matching, ignored when malformed (scheme, path, userinfo, wildcard or control characters) and ignored entirely when NODE_ENV is production. It never belongs in NEXT_PUBLIC_* configuration and does not change cookies, return-destination allowlists or academy authority. A production host must be configured as a canonical HTTPS origin instead.

Student exam teardown uses `POST /api/student/exams/<examId>/departure` without a page rewrite. It requires the exact configured student Origin, ordinary cookie authority and the original fenced editor generation. Its response is private/no-store receipt metadata only. This route is source-integrated; cloud and hosted release gates are recorded in the exams module README.
