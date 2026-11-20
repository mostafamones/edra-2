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

Tab and header bar items size images by their points, not a view frame. The feature catalog PNGs are 96 px at 1x, so `barIconSource` declares them at the SwiftUI imagesets' 24 pt with the scale the pixels imply (4x); `barIcon.test.ts` checks every catalog icon stays square and large enough for 3x.

Static verification covers module resolution, but native search activation and cancellation, keyboard and scroll clearance, back gestures, rotation, five-tab fit at large text sizes and assistive technology require device validation.
