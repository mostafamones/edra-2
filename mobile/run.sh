#!/bin/zsh
# Build, install and launch Edra Instructor on a connected iPhone WITHOUT Xcode or the Simulator
# (no LLDB, far less RAM). Never targets simulators.
# Usage: ./run.sh [device-id]   (CoreDevice id or UDID; defaults to the first connected iPhone)
set -euo pipefail
cd "$(dirname "$0")"

[[ -f Configuration/Local.xcconfig ]] || {
  echo "Missing Configuration/Local.xcconfig — copy Configuration/Development.xcconfig.example and fill it in."
  exit 1
}

# devicectl uses the CoreDevice identifier; xcodebuild needs the hardware UDID. Resolve both.
LIST=$(mktemp)
xcrun devicectl list devices --json-output "$LIST" >/dev/null 2>&1 || true
IDS=$(python3 - "$LIST" "${1:-}" <<'PY'
import json, sys
want = sys.argv[2]
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    devices = []
for d in devices:
    if d["hardwareProperties"].get("platform") != "iOS":
        continue
    if d["connectionProperties"].get("tunnelState") == "unavailable":
        continue
    if want and want not in (d["identifier"], d["hardwareProperties"]["udid"]):
        continue
    print(d["identifier"], d["hardwareProperties"]["udid"])
    break
PY
)
rm -f "$LIST"
[[ -n "$IDS" ]] || {
  echo "No connected iPhone found. Plug it in via USB, unlock it, and tap 'Trust' if asked."
  exit 1
}
DEVICE=${IDS%% *}   # CoreDevice id (devicectl)
UDID=${IDS##* }     # hardware UDID (xcodebuild)

DERIVED=build/DerivedData
xcodebuild -project EdraInstructor.xcodeproj -scheme EdraInstructor -configuration Debug \
  -destination "id=$UDID" -derivedDataPath "$DERIVED" -allowProvisioningUpdates build -quiet

APP="$DERIVED/Build/Products/Debug-iphoneos/EdraInstructor.app"
xcrun devicectl device install app --device "$DEVICE" "$APP"
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE_ID"
