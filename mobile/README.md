# Edra Instructor (iOS)

Native SwiftUI instructor companion app. Backend is the Edra web API + cloud Supabase (see `../AGENTS.md`, `AGENTS.md`).

## Toolchain

- Xcode 26.4.1 (iOS SDK 26.4), Swift 6 language mode, deployment target iOS 17.0, iPhone only.
- Supabase Swift SDK pinned to exactly 2.55.3 via SPM (`Package.resolved` is committed).
- Dev bundle ID: `com.mostafamones.edra.instructor.dev` (not a distribution identity).

## One-time setup

```sh
cp Configuration/Development.xcconfig.example Configuration/Local.xcconfig   # git-ignored
# fill in: Supabase URL + publishable key, API origin (reachable from the phone), DEVELOPMENT_TEAM
```

Only public values go in there. The phone cannot reach `app.lvh.me`/`localhost`, so `EDRA_API_ORIGIN` must be reachable from the phone and accepted by the web proxy; plain http is allowed only for `mones.ddns.net` (ATS exception in `Configuration/Info.plist`).

On the iPhone: enable Developer Mode (Settings > Privacy & Security), connect via USB, unlock, tap Trust.

## Run on your phone (no Xcode, no Simulator)

```sh
./run.sh            # first connected iPhone
./run.sh <device-id>
```

Builds with `xcodebuild` for the device, installs and launches with `devicectl`. It never targets a simulator. List devices: `xcrun devicectl list devices`.

## Build check without a device

```sh
xcodebuild -project EdraInstructor.xcodeproj -scheme EdraInstructor \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Unit tests (`EdraInstructorTests`, Swift Testing) need a runtime to execute; run them from Xcode on the phone (Cmd+U) when needed.

## Status

Done: project shell, typed public configuration with an actionable "not configured" screen, Supabase dependency, shared scheme, `run.sh`.
Not yet: sign-in (Keychain session), `GET /api/v1/academies` HTTP adapter, academy selection, Tabler icon assets (none used yet), live sessions, scanner. See `../planning/mobile/setup.md` checkpoints B–D.
