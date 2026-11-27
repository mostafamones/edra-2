# Instructor navigation bindings

Import `appChrome` and `featureChrome` from `./navigation` in `src/App.tsx`. Mount the API-backed app below the existing safe-area provider, status bar and themed React Navigation container. The entry supplies the `AppServices` instance.

```tsx
<NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
  <EdraApp
    chrome={appChrome}
    sessions={featureChrome.sessions}
    assessments={featureChrome.assessments}
    services={services}
  />
</NavigationContainer>
```

The shell supplies each tab's history and the selected tab. The native stack keeps route keys across updates and reports completed pops to the shell. The shell has five icon-only tabs (Overview, Sessions, Assessments, Students, Concerns; `iconOnly`: Android `unlabeled`, iOS items without a title, titles kept as accessibility labels); academy choice lives on Overview. The workspace hosts independent native tabs in the full-screen feature presentation. The workspace model supplies the Scan capability, search text and selection mode. Scan mounts on focus, and the search-role item becomes an action while selecting.

iOS 26.1 and later use the detached search-role tab for workspace search. iOS 17 through 26.0 use Students header search and a toolbar Announce action. The iOS 26.0 layout differs from the SwiftUI baseline because the pinned native tab library exposes the search role from iOS 26.1. Android uses Material bottom navigation and the native toolbar search action. Its tab host can respect keyboard insets from API 30 with the system resize mode. Session sheets still use the feature sheet header.

On iOS, the assignment workspace is a native-stack `fullScreenModal` route in the Assessments stack (`StackProps` route `modal`, `AppChrome.modalRoutes`), not a React Native `Modal`. A native-stack screen inside a React Native `Modal` attaches its own `RCTSurfaceTouchHandler` below the Modal's; that inner handler fails against the outer one and sends touchCancel for the same touch, so no Pressable in the workspace fired on device (rows, pills). A presented native-stack screen owns the only handler and nested screens defer to it; `workspaceTouches.test.ts` guards the topology. Marking and announce are the SwiftUI page sheet with its own bar, as Sessions sheets. Student lists run under the glass tab bar and take UIKit's automatic content and indicator insets; Scan and non-list content stay above it. The workspace Back item uses the system `chevron.backward` glyph. Android keeps the React Native Modal cover.

Native stack bars on iOS take the page's own semantic background (`pageBackground`): pushed Sessions routes use `systemBackground`, workspace panes `systemGroupedBackground`, with no hairline. Otherwise native-stack paints the theme's `card` colour as an opaque bar, a grey slab above dark pages. The bar stays a native `UINavigationBar` with system back, glass items and the same insets. A pushed route on a grouped page (Settings) needs an opt-in route background in `StackProps` to match in light mode; dark mode already matches. Android keeps the theme header.

Tab and header bar items size images by their points, not a view frame. The feature catalog PNGs are 96 px at 1x, so `barIconSource` declares them at the SwiftUI imagesets' 24 pt with the scale the pixels imply (4x); `barIcon.test.ts` checks every catalog icon stays square and large enough for 3x.

Static verification covers module resolution, but native search activation and cancellation, keyboard and scroll clearance, back gestures, rotation, five-tab fit at large text sizes and assistive technology require device validation.
