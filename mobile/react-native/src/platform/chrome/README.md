# Feature chrome

Call `createFeatureChrome` once with stable foundation components and hooks. Pass the returned `sessions` and `assessments` directly to `EdraApp`. Import from `src/platform/chrome` without a file extension so Metro resolves the iOS adapters. The default files target Android.

- `Tabs` is the foundation's assessment workspace tab component. Enable `hasSearchTab` only when the injected tabs implement the native search role, search editing, and the selection-mode confirmation action. With the flag off, the workspace uses the Students bar for search and the toolbar for confirmation.
- `RouteHeader` owns the pushed Sessions header and back navigation. Render it under the foundation's stack. The adapter renders the sheet's inline header itself.
- Supply an actual route focus hook and a route bottom-inset hook that includes tab clearance where applicable. Both hooks must also be callable in sheet content under the same navigation context. The sheet uses its own safe-area inset.
- Use the Expo SDK 58 development build with `@expo/ui`, `expo-glass-effect`, `react-native-safe-area-context`, `expo-camera`, and the existing Apple `EdraCamera` module. No extra native module is needed for the adapters here.
- Assessments receives user dismissals. Sessions also receives controlled dismissals. Full-screen covers close via toolbar actions, or Android Back when allowed. Page sheets use SwiftUI detents and interactive dismissal or a Compose modal sheet with a half-height or near-full-height body and native back, scrim, and gesture guards.

The iOS assessment page uses an Expo SwiftUI stack with inline title, toolbar, and native search drawer. Session sheets use an inline feature bar and a controlled native text input to preserve search-submit behavior. Matching SwiftUI sheet navigation and the explicit always-visible search drawer would require additional integration. The native iOS popup uses system menu items and selection states. The SDK does not expose a templated bundled image for those menu actions, so their labels are text-only. Android popups render the supplied Hugeicons.

The template icons are rasterized from Edra's checked-in Hugeicons Free v4.3.5 SVGs (MIT, stroke width 1.5). Run `node src/platform/chrome/icons/sync.cjs` from the Expo app to regenerate them with the scaffold's pinned Resvg dependency. The Apple camera keeps its own native controls.

Device acceptance remains open. Check nested sheets and full-screen covers, dismissal during draft saves and publication, focus restoration, keyboard and bottom insets, menu and row gestures, VoiceOver and TalkBack, glass and material appearance on the supported iOS versions, and camera permission and scan behavior on physical iOS and Android devices. The base camera's use of `StyleSheet.absoluteFillObject` requires the React Native 0.88 `StyleSheet.absoluteFill` spelling when integrating.
