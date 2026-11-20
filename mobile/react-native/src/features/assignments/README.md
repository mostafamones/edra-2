# Assessments screens (React Native)

React Native assignment list, workspace, marking and announcement screens. Domain state is in `assignments.ts`, `workspace.ts` and `marking.ts`; the screens only compose it.

| Screen | Swift reference |
| --- | --- |
| `AssignmentsScreen.tsx` | `AssignmentsView.swift`; presents the workspace full screen |
| `WorkspaceScreen.tsx` | `WorkspaceView.swift` + `AnnounceSheet` |
| `ScanPane.tsx` | `AssignmentScanView.swift` |
| `MarkingSheet.tsx` | `MarkingSheet.swift` |

## Native adapter contract

`platform.ts` defines `AssessmentPlatform`, which the app shell builds once and passes to `AssignmentsScreen`. The foundation owns its implementation. On iOS it uses UIKit/SwiftUI, with Liquid Glass on iOS 26. On Android it uses visually similar controls without glass:

- `NavigationBar`: an inline title, leading cancel/back and trailing confirm items (`BarItem`), and an optional search field (used only when `hasSearchTab` is false).
- `Tabs`: the workspace's own tab bar. The screen supplies the tabs and their wording. On iOS 26, the search tab has the search role and the screen intercepts it while selecting.
- `Sheet`: `fullScreen` for the workspace and `sheet` for marking and Announce. The sheet honours `dismissDisabled`. `onDismiss` reports user dismissal. All three use the grouped background as the whole presentation surface (iOS `presentationBackground`, Android `containerColor`), so bar, body and bottom inset match; Sessions sheets keep their default.
- `Menu` (optional): a tap-to-open menu with a selection tick for the Status and Sort pills. Wire it to the shared `Popup` (`Menu: Popup` in `createFeatureChrome`); until then the pills fall back to `confirm`/`systemConfirm`, which has no tick.
- `Segmented`, `ContextMenu`, `GlassCapsule` and `Icon`. Student rows no longer use `ContextMenu`: they are plain rows whose long press (and the accessibility long-press action, labelled Select) starts selection with that student when eligible, so a tap always opens marking. Announcing one selected student sends at once; several open the Announce review. `Icon` maps `IconName` to the bundled Hugeicons assets.
- `Camera`: the code preview with the shared torch, zoom and pinch controls. It reports all visible codes for each frame. `requestCameraPermission` is also part of this contract. Both come from `assessmentCamera(torchIcon)` in `src/platform/camera`.
- `confirm` (optional): a confirmation dialog. It defaults to `systemConfirm`, which uses `ActionSheetIOS` on iOS and `Alert` on Android.

Core React Native supplies the remaining native pieces directly: `ActivityIndicator`, `RefreshControl`, `Switch`, `TextInput`, `Alert`, `Linking.openSettings` and `AppState`. Colours are iOS semantic colours through `PlatformColor`. The accent is Edra green as a `DynamicColorIOS` (#008236 / #026630): the generated Expo catalog has no `AccentColor` asset, so `PlatformColor('AccentColor')` drew nothing (invisible selected chip and selection glyphs). Android uses their published light and dark values (`theme.ts`).

## Shell composition

```tsx
<AssignmentsScreen model={assignments} platform={assessmentPlatform} open={openAssignment} onOpen={setOpenAssignment} />
```

The shell keeps the current Swift responsibilities: the "Assessments" page chrome, `assignments.load(context)` on each context change, and the academy-switch guard (`assignments.switchNeedsConfirmation` / `activeMarking.save()` / `discardActiveMarking()`).

## Students list

- Status (`filter`) and search are server-side and paged by name (50 rows, "Load more").
- Sort: Name is the server's order. Group needs the whole cohort, so it refetches with the server's 1000-row page and sorts on device; it is disabled, and reverts to Name, when the list is larger than that. No backend change.
- Scan (tab and camera) appears only when marking is permitted and the detail reports `student_codes_enabled: true`.
