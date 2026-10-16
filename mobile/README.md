# Edra Instructor (iOS)

Native SwiftUI instructor companion app. Backend is the Edra web API + cloud Supabase (see `../AGENTS.md`, `AGENTS.md`).

## Toolchain

- Xcode tools, Swift 6 language mode, deployment target iOS 17.0, iPhone only. The installed Xcode/SDK version was not verified by this documentation review.
- Supabase Swift SDK pinned to exactly 2.55.3 via SPM (`Package.resolved` is committed).
- The app target currently declares `com.mostafamones.edra`; Base.xcconfig retains an older development identifier. Check the resolved target/configuration signing and bundle settings before installing or distributing; this reference does not approve a distribution identity.

## One-time setup

```sh
cp Configuration/Development.xcconfig.example Configuration/Local.xcconfig   # git-ignored
# fill in: Supabase URL + publishable key, API origin (reachable from the phone), DEVELOPMENT_TEAM
```

Only public values go in there. The phone cannot reach `app.lvh.me`/`localhost`, so `EDRA_API_ORIGIN` must be reachable from the phone and accepted by the web proxy; plain http is allowed only for `mones.ddns.net` (ATS exception in `Configuration/Info.plist`).

On the iPhone: enable Developer Mode (Settings > Privacy & Security), connect via USB, unlock, tap Trust.

## Run on your phone without opening the Xcode IDE

```sh
./run.sh            # first connected iPhone
./run.sh <device-id>
```

Requires installed Xcode command-line tools. Builds with `xcodebuild` for the device, installs and launches with `devicectl`. It never targets a simulator. List devices: `xcrun devicectl list devices`.

## Build check without a device

```sh
xcodebuild -project EdraInstructor.xcodeproj -scheme EdraInstructor \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Unit tests (`EdraInstructorTests`, Swift Testing) need a runtime to execute; run them from Xcode on the phone (Cmd+U) when needed.

## Source and verification

The source includes staff sign-in, a bearer HTTP adapter, academy selection, live-session/attendance screens, a schedule picker that starts or opens sessions, student-code scanner components and bundled Tabler icons. The authenticated root connects sign-in, academy selection and session navigation.

This description was checked against source on 2026-10-12. It does not establish that every workflow is complete or verified on a device. Build, device, secure-session-storage and deployed-API behavior require their own verification; use the setup and run instructions above for the intended target.

## Documentation

See the [native index](docs/README.md) for product scope, engineering and current API integration. Shared rules have one source under docs/engineering/ at the repository root.
