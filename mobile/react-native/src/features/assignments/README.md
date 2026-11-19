# Assessments screens (React Native)

React Native ports of `EdraInstructor/Features/Assignments` views. The Swift views remain the reference for layout, wording and interaction. Domain state is in `assignments.ts`, `workspace.ts` and `marking.ts`; the screens only compose it.

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
- `Sheet`: `fullScreen` for the workspace and `sheet` for marking and Announce. The sheet honours `dismissDisabled`. `onDismiss` reports user dismissal.
- `Segmented`, `ContextMenu`, `GlassCapsule` and `Icon`. `Icon` maps `IconName` to the bundled Hugeicons assets.
- `Camera`: the code preview with the shared torch, zoom and pinch controls. It reports all visible codes for each frame. `requestCameraPermission` is also part of this contract.
- `confirm` (optional): a confirmation dialog. It defaults to `systemConfirm`, which uses `ActionSheetIOS` on iOS and `Alert` on Android.

Core React Native supplies the remaining native pieces directly: `ActivityIndicator`, `RefreshControl`, `Switch`, `TextInput`, `Alert`, `Linking.openSettings` and `AppState`. Colours are iOS semantic colours through `PlatformColor`, including the `AccentColor` asset. Android uses their published light and dark values (`theme.ts`).

## Shell composition

```tsx
<AssignmentsScreen model={assignments} platform={assessmentPlatform} />
```

The shell keeps the current Swift responsibilities: the "Assessments" page chrome, `assignments.load(context)` on each context change, and the academy-switch guard (`assignments.switchNeedsConfirmation` / `activeMarking.save()` / `discardActiveMarking()`).
