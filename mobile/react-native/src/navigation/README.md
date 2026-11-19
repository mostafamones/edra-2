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

The shell supplies each tab's history and the selected tab. The native stack keeps route keys across updates and reports completed pops to the shell. The Academy tab opens the existing anchored popover on iOS and the menu above the tab bar on Android. The workspace hosts independent native tabs in the full-screen feature presentation. The workspace model supplies the Scan capability, search text and selection mode. Scan mounts on focus, and the search-role item becomes an action while selecting.

iOS 26.1 and later use the detached search-role tab for Academy and workspace search. iOS 17 through 26.0 use the classic Academy item, Students header search and a toolbar Announce action. The iOS 26.0 layout differs from the SwiftUI baseline because the pinned native tab library exposes the search role from iOS 26.1. Android uses Material bottom navigation and the native toolbar search action. Its tab host can respect keyboard insets from API 30 with the system resize mode. Session sheets still use the feature sheet header.

Tab and header bar items size images by their points, not a view frame. The feature catalog PNGs are 96 px at 1x, so `barIconSource` declares them at the SwiftUI imagesets' 24 pt with the scale the pixels imply (4x); `barIcon.test.ts` checks every catalog icon stays square and large enough for 3x.

Static verification covers module resolution, but native search activation and cancellation, keyboard and scroll clearance, academy popover positioning, back gestures, rotation and assistive technology require device validation. The iOS popover inherits the prototype's calculated anchor and needs coverage outside the reference iPhone layout.
