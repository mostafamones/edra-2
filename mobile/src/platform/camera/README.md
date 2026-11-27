# Camera and code scanner adapter

`ScannerCamera` is the rear-camera code preview for both workflows. Screens stay in React Native and own their wording, permission prompts and business state. This adapter only delivers what `ScannerModel` (attendance) and `ScanFilter` (assessments) rely on: every report lists all codes currently in view, and a code that leaves view is reported gone.

| Platform | Implementation |
| --- | --- |
| iOS | Local Expo module `modules/edra-camera` (`EdraCameraView`). This is the Swift app's AVFoundation `CameraPreview`, `CameraController` and Liquid Glass `CameraControls`: back wide-angle camera, `resizeAspectFill`, near-focus autofocus, torch, 1×/2×/4× zoom up to 6× and pinch. It uses the same ten symbologies and reports complete metadata frames, including empty frames. |
| Android | `expo-camera` `CameraView`: `facing="back"`, fill preview (no `ratio`), the same symbologies (`itf14` is MLKit ITF), torch and pinch on expo's linear zoom. There are no factor presets because Expo exposes no zoom factors. |

expo-camera was not used on iOS. It reports one code per event and never an empty frame, which loses the "held or removed" signal. It also cannot reproduce the existing focus, torch availability and zoom-factor behaviour.

## Behaviour

- **Cadence, pause and rearm** (`CodePresence`): each decoded frame reports the full visible set. On Android, a code that has not been decoded for `HOLD_MS` (500 ms) has left view and triggers a report without it. Pausing (an open card or marking sheet) and suppression stay in the models, which receive every frame.
- **Lifecycle**: reports stop while the app is inactive or the session is interrupted. When the camera resumes, held codes get a fresh window, so a card held through backgrounding is not rescanned.
- **Status** (`nextStatus`, `statusNotice`): `starting → running ⇄ interrupted(reason)`. `failed` persists until the view mounts again. Backgrounding shows nothing. Use by another app, multitasking, system pressure and failures show a short notice over the preview. Screens may observe the status with `onStatus`.
- **Torch** (`nextTorch` on Android; `CameraController` on iOS): starts off on attach, toggles only when available, and turns off whenever the camera stops. It never comes back on by itself.
- **Permission** (`requestCameraPermission`): uses expo-camera's API on both platforms. It asks only while the permission is undetermined; otherwise it returns `granted` or `denied`. Screens show Open Settings when the result is `denied`.

## Contracts

```tsx
// Assessments: spread into the AssessmentPlatform object.
const assessmentPlatform = { ...assessmentCamera(torchIcon), Icon, NavigationBar /* … */ }

// Attendance scanner screen (when not `scanner.blockedReason`):
<ScannerCamera {...sessionCameraProps(scanner)} torchIcon={torchIcon} style={{ height: 300, borderRadius: 20 }} />
```

`torchIcon(on)` renders the bundled Hugeicons `flash` / `flash-off` assets on Android. iOS renders its own icons natively.

## Foundation wiring

The Expo foundation provides the following:

- Dependencies: `expo-camera` pinned to SDK 58’s `58.0.14`. The adapter also needs `expo` (`requireNativeView`, Expo Modules autolinking), `react` and `react-native`.
- Config plugin: `["expo-camera", { "cameraPermission": "Edra uses the camera to scan student cards for attendance.", "microphonePermission": false, "recordAudioAndroid": false }]`. This adds `NSCameraUsageDescription` (the current Info.plist wording) and `android.permission.CAMERA` without microphone or audio permissions. On Android, barcode scanning also requires `expo-camera` in `expo.autolinking.android.buildFromSource` (package.json) per the plugin docs.
- Local module: Expo autolinking discovers `modules/edra-camera` (default `nativeModulesDir`) through `expo-module.config.json` (`EdraCameraModule`, apple only). Pod target iOS 17. It does not affect Android.
- Assets: `hugeicons-flash` and `hugeicons-flash-off` are copied from the Swift app’s asset catalog into the generated iOS app catalog because `CameraControls` loads them from the main bundle. Android needs equivalent bundled assets for `torchIcon`.

## Verification

`node --test mobile/src/platform/camera/*.test.ts` covers presence/rearm with `ScanFilter`, status, torch, permission and pinch. The `.tsx` and Swift sources need the foundation toolchain to type-check and build. Camera behaviour requires device evidence on iPhone and Android.
