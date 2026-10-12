# Edra native guidance

Follow `../AGENTS.md`, including Master-thread planning-only and cloud-database rules. Current iPhone setup is in `README.md`; `docs/README.md` links approved scope, native engineering and current API integration. Temporary setup plans are not permanent prerequisites.

## Confirmed platform and architecture

- The iOS app uses Swift and SwiftUI. Android direction is native Kotlin parity with the iPhone companion at port time; initialize it only through its authorized implementation plan. Do not replace native apps with Expo, React Native or a web wrapper, or introduce a mobile Node workspace.
- The product is a simplified instructor dashboard with academy selection, live sessions, and shared attendance; it is not constrained to a single scan screen. The approved instructor MVP includes session/attendance and physical marking; later enhancements remain provisional until reviewed before implementation planning.
- Maintain the Xcode project, shared schemes, Swift Package Manager dependency resolution, tests, and release workflow independently of `web/`. Do not migrate web dependencies or introduce root workspace orchestration for native setup.
- Read the relevant web-owned OpenAPI and `docs/api.md`, then distinguish source support from verified deployment. Use the official Supabase Swift SDK for existing staff phone/password authentication and Edra's bearer HTTP API for academy/session/attendance reads and mutations.
- Keep business rules on the server/database. No direct attendance-table writes, duplicate backend, web server-module imports, or service-role/provider secrets in the app.
- Keep feature views/models/services under native feature folders and small infrastructure under a native Core/Infrastructure boundary. Views compose state; they do not own network/auth/business rules. Use clear Swift types and deliberate actor isolation rather than reproducing Next.js directory/API conventions.

## Auth, configuration, and data

- Persist access/refresh credentials in iOS Keychain through the selected SDK's verified secure storage or a tested adapter. Never store passwords/tokens in UserDefaults, bundled configuration, URLs, barcode payloads, or logs.
- Public project URL/publishable key and API origin may be app configuration; app binaries expose them. Keep backend/provider/signing credentials off the client and out of commits.
- Use a single auth authority with controlled refresh and scene lifecycle handling. Obtain the current token per request; do not capture a stale token indefinitely. Clear local credentials/context/cache and cancel stale tasks on sign-out/account switch or membership removal.
- Display selected academy/session during attendance. Scope cache and pending inputs by user, academy, and session; late task completions cannot populate another account's view.
- Success requires server acknowledgment. Preserve mutation idempotency keys on retry; do not invent offline publication or silently overwrite conflicts.
- Codes are optional, capability-dependent identifiers. UUID/name-based manual attendance stays available. Do not claim scanning works before backend lookup and native decoding are integrated.

## Native UI and resources

- Use accessible SwiftUI/native foundations with safe areas, keyboard handling, Dynamic Type, VoiceOver, and loading/error/empty states. Browser shadcn/Radix primitives do not apply to native views.
- Ordinary application icons must come from Tabler. Brand logos use official assets and their brand colors unless a different variant is explicitly specified; they are exempt from the Tabler requirement. Bundle the small required set as native-compatible vector/image assets with upstream source/version/license attribution and a reproducible conversion approach. Do not introduce another icon set or use SF Symbols as an unapproved replacement for application icons; standard system-controlled UI remains native.
- Keep assets inside the iOS asset catalog and avoid a runtime SVG framework for a handful of static icons unless a concrete need justifies it. Do not edit protected web primitives/theme configuration for mobile.
- Use Swift Package Manager for necessary native dependencies and commit Package.resolved. Read the selected SDK's current Swift/Xcode/iOS requirements before pinning; avoid deprecated signatures or unnecessary packages.
- Keep local xcconfig files, signing assets, DerivedData, build products, and user-specific Xcode state out of commits. Commit project configuration and shared schemes required for reproducible builds. Preserve owner changes and generated platform guidance where applicable.

## Verification and external changes

- Run the applicable native build, app tests and Swift formatting/static checks for implementation using available authorized runtimes; the current `run.sh` targets a connected iPhone. Keep simulator compilation, simulator runtime, physical-device evidence, and signed distribution status distinct.
- Test auth persistence/refresh/sign-out, API errors, cancelled tasks, nonstaff/removed membership, and academy isolation in the relevant slice. Report unavailable Xcode/runtime/device/cloud paths precisely.
- Use only authorized cloud Supabase/API targets; no local database or reset of a shared project. Routine non-destructive backend migrations are pre-approved during authorized implementation under web guidance; destructive or hard-to-reverse changes require explicit approval. Native setup does not by itself authorize server deployment, signing-account changes, TestFlight/App Store submission or production distribution.
- Native development never suspends Master-thread planning-only restrictions. Sensitive edits to this guidance require owner authorization, as with web guidance.
