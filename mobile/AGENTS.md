# Edra native guidance

Follow `../AGENTS.md`, including Master-thread planning-only and cloud-database rules. Current iPhone setup is in `README.md`; `docs/README.md` links approved scope, native engineering and current API integration. Temporary setup plans are not permanent prerequisites.

## Confirmed platform and architecture

- The current iOS app uses Swift and SwiftUI. The approved destination is one React Native instructor companion for iOS and Android, with its Node dependencies and lockfile scoped to `mobile/`. Use Expo development builds for the migration. Initialize the toolchain and Android app only through authorized implementation.
- React Native owns every screen, route and feature state after cutover. Use native UIKit or SwiftUI components for iOS tabs, navigation chrome, presentation, Liquid Glass controls and other platform behavior where needed. SwiftUI may implement components consumed by React Native. Preserve the approved iPhone appearance and interaction on the same devices and OS versions, including native fallbacks on earlier supported versions. Complete and review the separate Hugeicons update before capturing the migration baseline.
- The product is a simplified instructor dashboard with academy selection, live sessions, and shared attendance; it is not constrained to a single scan screen. The approved instructor MVP includes session/attendance and physical marking; later enhancements remain provisional until reviewed before implementation planning.
- Maintain the existing Xcode project, shared schemes, Swift Package Manager dependency resolution, tests and release workflow through migration validation. Keep mobile build and release workflows independent of `web/`. Do not migrate web dependencies or introduce root workspace orchestration.
- Read the relevant web-owned OpenAPI and `docs/api.md`, then distinguish source support from verified deployment. The current iOS build uses the official Supabase Swift SDK for staff phone/password authentication. Preserve secure session continuity when migrating the app. Use Edra's bearer HTTP API for companion reads and mutations.
- Keep business rules on the server/database. No direct attendance-table writes, duplicate backend, web server-module imports, or service-role/provider secrets in the app.
- Keep screens and models organized by mobile feature. Share TypeScript workflows and API contracts across the React Native targets. Keep native component contracts narrow and use deliberate actor isolation for Swift work. Views compose state; they do not own network/auth/business rules.

## Auth, configuration, and data

- Persist access/refresh credentials in iOS Keychain and in Android Keystore-backed storage through a verified SDK implementation or tested adapter. Never store passwords/tokens in UserDefaults, bundled configuration, URLs, barcode payloads, or logs.
- Public project URL/publishable key and API origin may be app configuration; app binaries expose them. Keep backend/provider/signing credentials off the client and out of commits.
- Use a single auth authority with controlled refresh and scene lifecycle handling. Obtain the current token per request; do not capture a stale token indefinitely. Clear local credentials/context/cache and cancel stale tasks on sign-out/account switch or membership removal.
- Display selected academy/session during attendance. Scope cache and pending inputs by user, academy, and session; late task completions cannot populate another account's view.
- Success requires server acknowledgment. Preserve mutation idempotency keys on retry; do not invent offline publication or silently overwrite conflicts.
- Codes are optional, capability-dependent identifiers. UUID/name-based manual attendance stays available. Do not claim scanning works before backend lookup and native decoding are integrated.

## Native UI and resources

- Preserve safe areas, keyboard handling, Dynamic Type, VoiceOver, system gestures and loading/error/empty states when React Native composes the UI. Verify the Android equivalents, including TalkBack. Browser shadcn/Radix primitives do not apply to mobile views.
- Ordinary application icons must come from Hugeicons with a stroke width of `1.5` preserved in the bundled assets. Brand logos use official assets and their brand colors unless a different variant is explicitly specified; they are exempt from the Hugeicons requirement. Bundle the small required set as native-compatible vector/image assets with upstream source/version/license attribution and a reproducible conversion approach. Do not introduce another icon set or use SF Symbols as an unapproved replacement for application icons; standard system-controlled UI remains native.
- Keep assets inside the iOS asset catalog and avoid a runtime SVG framework for a handful of static icons unless a concrete need justifies it. Do not edit protected web primitives/theme configuration for mobile.
- Preserve the Swift Package Manager resolution for the existing iOS build. Pin the React Native toolchain and commit the applicable platform dependency resolution files. Verify SDK requirements and compatibility with the existing iOS deployment target before pinning.
- Keep local xcconfig files, signing assets, DerivedData, build products, and user-specific Xcode state out of commits. Commit project configuration and shared schemes required for reproducible builds. Preserve owner changes and generated platform guidance where applicable.

## Verification and external changes

- Run the applicable native build, app tests and Swift formatting/static checks for implementation using available authorized runtimes; the current `run.sh` targets a connected iPhone. Keep simulator compilation, simulator runtime, physical-device evidence, and signed distribution status distinct.
- Test auth persistence/refresh/sign-out, API errors, cancelled tasks, nonstaff/removed membership, and academy isolation in the relevant slice. Report unavailable Xcode/runtime/device/cloud paths precisely.
- Use only authorized cloud Supabase/API targets; no local database or reset of a shared project. Routine non-destructive backend migrations are pre-approved during authorized implementation under web guidance; destructive or hard-to-reverse changes require explicit approval. Native setup does not by itself authorize server deployment, signing-account changes, TestFlight/App Store submission or production distribution.
- Native development never suspends Master-thread planning-only restrictions. Sensitive edits to this guidance require owner authorization, as with web guidance.
