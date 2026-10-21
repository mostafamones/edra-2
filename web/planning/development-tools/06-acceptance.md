# Task 6 — scoped acceptance and handoff

Prerequisites: tasks 1–5 pass. Read the final product contract and shared execution rules; inspect only files needed by a failing acceptance case. This is verification/repair within the agreed scope, not permission to add deferred features or scale.

## Walkthrough

1. Sign in normally as the authorized owner. Confirm the synthetic academy appears and their ordinary membership is Instructor. Enter/leave using normal academy switching.
2. Enter Developer mode. Visit staff pages as Owner, Head Admin, Admin and two instructors. Confirm one meaningful manager-only operation is denied as Instructor and allowed as a manager.
3. From the real account's student directory, View as student directly; Return to staff restores the real Instructor identity/directory. Repeat from a generated staff identity and restore that identity.
4. View two generated students: confirm their own current participation and standalone historical exams/results; start/answer/submit the available exam for one student and verify the other has separate work. Do not claim unsupported assignment portal surfaces work.
5. Make a normal attendance or marking change; switch away/back and verify persistence. Confirm generated outbox effects remain suppressed.
6. Verify return context, exit, sign-out, source-session revocation, stale switch commands and other development-tab revalidation. No stale role may authorize a forbidden server mutation.
7. Check unauthorized account, ordinary academy Owner and non-generated student targets are denied. Check production/disabled-config paths.
8. Run `verify --mode baseline` before interactive changes, then `verify --mode integrity` and outside-academy sentinels afterward. Separate baseline dataset counts from changes deliberately made during acceptance; a legitimate pending attendance/result correction is not a fixture failure.
9. Record no real OTP/message/provider call. Do not send a real message as a test.
10. Run appropriate lint/build/selected unit/cloud checks. Full CI DB suite remains CI; do not run it against the shared app project.

Use product-native T3 preview tools first when available; follow the current browser-tool instructions. Never write generated credentials into screenshots/logs/recordings. Use the configured cloud project; no local stack.

## Report

Publish a short implementation verification record under `web/docs/technical/`: code/schema version, run ID, reference date, actual counts, pass/fail by task acceptance IDs, browser journeys, cloud checks, no-delivery evidence and limitations. Repair only defects in this scope; if an existing product bug blocks a journey, report exact evidence and do not expand into that feature.

Stop after the 20-student acceptance. Expansion to 300–500 requires the owner's later decision. Do not perform a destructive reset as part of acceptance, commit plans or push.
