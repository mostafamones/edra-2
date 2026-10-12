# Native engineering

Follow the [shared boundaries](../../docs/engineering/application-boundaries.md) and [brand](../../docs/engineering/brand.md). iOS uses Swift/SwiftUI; Android direction is native Kotlin. Each platform owns its build and release process.

## Features and integration

Keep views/models/services in native feature folders, with small configuration/auth/networking infrastructure under Core. Views compose state; backend services own academic rules. Use Supabase Auth and the [web-owned HTTP API](../../web/docs/api/README.md), not direct attendance writes or imports of server internals.

Scope pending work/cache to account, academy and academic record. Clear affected context on sign-out/membership loss and reject late results for a different context. Success requires server acknowledgment; retries preserve mutation identity. Local edits do not authorize offline finalization or silent conflict overwrites.

Use current credentials per request, controlled refresh and secure platform storage. Public URL/key/API origin configuration is visible in the binary; backend/provider/signing secrets do not belong there. Secure persistence must be verified rather than inferred from a sign-in screen.

## UI and dependencies

Use native accessibility, safe areas, keyboard handling and text sizing. Ordinary app icons are bundled Tabler assets with [attribution](../EdraInstructor/Resources/Assets.xcassets/Icons/ATTRIBUTION.md). Brand logos use official assets and brand colors unless a different variant is explicitly specified. Browser primitives do not define native components. Keep necessary native dependencies and committed resolution files; avoid speculative frameworks.

## Checks

Follow [the current iPhone build/run setup](../README.md). Verify affected auth refresh/sign-out, API failures, cancellation, tenant/context handling and retry behavior. Camera changes require relevant device evidence. Distinguish source, compilation, runtime and distribution checks; signed release is not established by a local build.

Use authorized cloud/API targets, not a default local database. Routine backend migrations follow the web policy; destructive/hard-to-reverse changes need approval. Signing-account changes and App Store/TestFlight distribution remain separately authorized release actions. Master threads remain planning-only.

Android-specific toolchain/UI/storage choices are made in its implementation planning. The confirmed direction does not claim an Android project already exists.
