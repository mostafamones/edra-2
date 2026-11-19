import type { ComponentType, ReactNode } from 'react'
import { ActionSheetIOS, Alert, Platform, type StyleProp, type ViewStyle } from 'react-native'

/**
 * What the Assessments screens need from the app's native layer. The screens (React Native) own
 * layout, wording, state and interaction; these pieces own platform chrome. On iOS they wrap the
 * actual UIKit/SwiftUI controls (Liquid Glass on iOS 26, system fallbacks before); on Android they
 * are visually similar equivalents without glass. Implementations must keep the
 * accessibility labels they are given and the component's native gestures (swipe to dismiss,
 * Android back = dismiss when allowed).
 */
export type AssessmentPlatform = Readonly<{
  /** Bundled Hugeicons asset (stroke 1.5), tinted with `color`. Decorative: the caller labels the control. */
  Icon: ComponentType<IconProps>
  /** One navigation stack page with an inline title. `search` puts the system search field in the bar. */
  NavigationBar: ComponentType<NavigationBarProps>
  /** The workspace's own tab bar; it covers the app's. */
  Tabs: ComponentType<TabsProps>
  /** Modal presentation: `fullScreen` (workspace) or a page `sheet` (marking, announce). */
  Sheet: ComponentType<SheetProps>
  /** UISegmentedControl / segmented buttons. */
  Segmented: ComponentType<SegmentedProps>
  /** Long-press menu (UIContextMenuInteraction on iOS). With no actions, renders children only. */
  ContextMenu: ComponentType<ContextMenuProps>
  /** Glass capsule on iOS 26 (`interactive` = glassEffect(.regular.interactive())), ultraThinMaterial before, a plain surface on Android. */
  GlassCapsule: ComponentType<{ interactive?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }>
  /**
   * Barcode/QR preview with the app's camera controls (torch, 1×/2×/4× zoom, pinch). Reports every code
   * currently visible on each frame (empty array when none). Stops when unmounted.
   */
  Camera: ComponentType<{ onCodes: (codes: string[]) => void; style?: StyleProp<ViewStyle> }>
  /** Asks once if undetermined; resolves the current camera permission. */
  requestCameraPermission: () => Promise<'granted' | 'denied'>
  /** iOS 26 has a search-role tab that becomes "Announce selected" while selecting. False: search is a bar on Students and confirm is a toolbar button. */
  hasSearchTab: boolean
  /** SwiftUI confirmationDialog. Defaults to `systemConfirm`. */
  confirm?: (dialog: Dialog) => void
}>

/** The bundled assets these screens use. Camera controls' icons belong to `Camera`. */
export type IconName =
  | 'file-edit'
  | 'users'
  | 'scan'
  | 'search-01'
  | 'tick-02'
  | 'checkmark-circle-02'
  | 'circle'
  | 'cancel-01'
  | 'chevron-left'
  | 'chevron-right'

export type IconProps = Readonly<{ name: IconName; size: number; color?: ViewStyle['backgroundColor'] }>

/** A toolbar item: leading = cancellation/back, trailing = confirmation. */
export type BarItem =
  | Readonly<{ kind: 'icon'; icon: IconName; label: string; onPress: () => void; disabled?: boolean }>
  | Readonly<{ kind: 'text'; title: string; onPress: () => void; disabled?: boolean; prominent?: boolean }>
  | Readonly<{ kind: 'progress' }>

export type NavigationBarProps = Readonly<{
  title: string
  leading?: BarItem | null
  trailing?: BarItem | null
  search?: Readonly<{ text: string; onChange: (text: string) => void; prompt: string }> | null
  children: ReactNode
}>

export type Pane = 'students' | 'scan' | 'search'
export type Tab = Readonly<{ pane: Pane; title: string; icon: IconName; /** iOS 26 search-role tab (trailing circle). */ search?: boolean }>

export type TabsProps = Readonly<{
  tabs: readonly Tab[]
  selected: Pane
  /** Every tap, including the search tab while it is the confirm button; the screen decides. */
  onSelect: (pane: Pane) => void
  /** The search tab's field; only with `hasSearchTab`. */
  searchText: string
  onSearchText: (text: string) => void
  searchPrompt: string
  /** Each pane, already wrapped in its NavigationBar. */
  render: (pane: Pane) => ReactNode
}>

export type SheetProps = Readonly<{
  visible: boolean
  presentation: 'fullScreen' | 'sheet'
  /** A user dismissal (swipe, Android back). Not called while `dismissDisabled`. */
  onDismiss: () => void
  dismissDisabled?: boolean
  children: ReactNode
}>

export type SegmentedProps = Readonly<{ values: readonly string[]; selectedIndex: number; onChange: (index: number) => void; accessibilityLabel: string }>

export type MenuAction = Readonly<{ title: string; disabled?: boolean; onPress: () => void }>
export type ContextMenuProps = Readonly<{ actions: readonly MenuAction[]; children: ReactNode }>

export type DialogAction = Readonly<{ title: string; role?: 'destructive' | 'cancel'; disabled?: boolean; onPress?: () => void }>
export type Dialog = Readonly<{ title: string; message?: string; actions: readonly DialogAction[] }>

/** UIAlertController action sheet on iOS (what confirmationDialog uses on iPhone); a system alert on Android. */
export function systemConfirm({ title, message, actions }: Dialog): void {
  if (Platform.OS === 'ios') {
    const index = (role: DialogAction['role']) => {
      const i = actions.findIndex((a) => a.role === role)
      return i < 0 ? undefined : i
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: actions.map((a) => a.title),
        destructiveButtonIndex: index('destructive'),
        cancelButtonIndex: index('cancel'),
        disabledButtonIndices: actions.flatMap((a, i) => (a.disabled ? [i] : [])),
      },
      (i) => actions[i]?.onPress?.(),
    )
    return
  }
  Alert.alert(
    title,
    message,
    actions.filter((a) => !a.disabled).map((a) => ({ text: a.title, style: a.role === 'destructive' ? 'destructive' : a.role === 'cancel' ? 'cancel' : 'default', onPress: a.onPress })),
    { cancelable: true },
  )
}

/** SwiftUI `.alert(title) { OK }`, both platforms' system alert. */
export function systemAlert(title: string, message: string | undefined, onDismiss: () => void): void {
  Alert.alert(title, message, [{ text: 'OK', style: 'cancel', onPress: onDismiss }], { cancelable: true, onDismiss })
}
