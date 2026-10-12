# Native API integration

The API contract is owned by [web](../../web/docs/api/README.md). Current endpoint names use snake_case; native models decode those fields rather than rename the backend contract. Product words such as Finalize and Announce do not require renaming existing publication endpoints.

## Current iOS adapter

Core/Networking/APIClient.swift uses an ephemeral URLSession without cookies, obtains a bearer token per request and retries once after forced refresh on 401. POST/PATCH take a caller-created Idempotency-Key reused for the logical action. Cancellation is propagated; 401/403 have typed handling and other failures surface the backend message where available.

The decoder converts snake_case and parses ISO dates. Keep request CodingKeys explicit where needed. Attendance uses expected versions/revisions: conflict means review the returned/current state, not retry with invented versions.

AcademiesModel restores the remembered academy only if it appears in the server's authorized list. SessionsModel clears a changed academy's list and checks its academy ID before accepting results. These are inspected source behaviors, not a claim that every account-switch/race path is runtime-tested.

## Current surface and limits

The native source calls academy/session/attendance reads, check-ins, attendance changes and attendance publication. The staff HTTP contract also exposes assignment reads/part marks and code resolution. Session start/end and individual result announcement remain web actions in the inspected HTTP surface; required future native operations need a backend plan, not invented endpoint names.

Keep backend errors, retry identity and authority aligned with OpenAPI/handlers. The source still enforces owner/admin/instructor roles; Head Admin and later product rules are intended scope awaiting enforcement. Source inspection does not verify deployed API/schema compatibility, secure token persistence or device behavior.
