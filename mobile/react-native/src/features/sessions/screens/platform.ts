import type { ComponentType, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

// The narrow presentation contract the sessions screens render through. Screens own layout, state and
// copy; the app foundation injects native chrome (stack headers, tabs, sheets, menus, Liquid Glass,
// Hugeicons assets and the camera). `corePlatform` is a React Native-core fallback for development.

/** Bundled Hugeicons assets these screens use (names match the iOS asset catalog, stroke 1.5). */
export type IconName =
  | 'hugeicons-add-01'
  | 'hugeicons-tick-02'
  | 'hugeicons-chevron-right'
  | 'hugeicons-user-x'
  | 'hugeicons-user-add-01'
  | 'hugeicons-clock-01'
  | 'hugeicons-scan'
  | 'hugeicons-more-horizontal'
  | (string & {}) // academy icons come from the academy record

export interface IconProps {
  name: IconName
  size?: number
  color?: string
}

/** A navigation-bar button. iOS: system bar item (glass on iOS 26); Android: top app bar action. */
export interface BarItem {
  title: string
  /** Shown instead of the title when set; `title` stays the accessibility label. */
  icon?: IconName
  onPress(): void
  disabled?: boolean
  /** Replaces the item with a spinner (e.g. while finalizing). */
  busy?: boolean
  /** `cancel` → cancellationAction (leading); `confirm` → confirmationAction (trailing, bold). */
  role?: 'cancel' | 'confirm'
}

/** `.searchable` on iOS, a search field in the top app bar on Android. */
export interface SearchBar {
  value: string
  onChange(text: string): void
  onSubmit?(): void
  placeholder: string
  /** iOS `.navigationBarDrawer(displayMode: .always)`. */
  alwaysVisible?: boolean
}

/**
 * The bar of the screen it is rendered in: a pushed route's native-stack header, or the nav bar inside a
 * sheet. Inline title display. A foundation implementation may call `navigation.setOptions` and render null.
 */
export interface HeaderProps {
  title: string
  leading?: BarItem
  trailing?: BarItem
  search?: SearchBar
}

/** Modal presentation. Children render their own `Header` and are mounted only while presented. */
export interface SheetProps {
  visible: boolean
  /** Called after any dismissal: swipe, back button, or the parent setting `visible` false. */
  onDismiss(): void
  /** `medium` = iOS `.presentationDetents([.medium])`. Default large page sheet. */
  detent?: 'medium' | 'large'
  /** iOS `.fullScreenCover`. */
  fullScreen?: boolean
  /** iOS `.interactiveDismissDisabled`; Android back is ignored too. */
  dismissDisabled?: boolean
  children: ReactNode
}

export type MenuItem =
  | {
      key: string
      title: string
      icon?: IconName
      onPress(): void
      destructive?: boolean
      disabled?: boolean
      /** Toggle/picker state: iOS checkmark, Android checkable item. */
      checked?: boolean
    }
  | { key: string; divider: true }

/** iOS `Menu` (UIMenu, `.menuOrder(.fixed)`); Android popup menu. `children` is the trigger's appearance. */
export interface MenuProps {
  items: MenuItem[]
  accessibilityLabel: string
  disabled?: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

/** Circle button. iOS 26: `.glass`/`.glassProminent`; earlier iOS: bordered(Prominent) circle; Android: no glass. */
export interface GlassButtonProps {
  icon: IconName
  accessibilityLabel: string
  /** Absent when the button is a `Menu` trigger. */
  onPress?(): void
  prominent?: boolean
  /** Visible circle diameter. */
  diameter: number
}

export interface DialogAction {
  title: string
  role?: 'default' | 'cancel' | 'destructive'
  onPress?(): void
}

/** `alert` = UIAlertController alert / Android AlertDialog; `actionSheet` = SwiftUI confirmationDialog. */
export interface Dialog {
  style: 'alert' | 'actionSheet'
  title: string
  message?: string
  actions: DialogAction[]
  /** Dismissed without choosing an action (Android back/outside tap, iPad popover tap-out). */
  onDismiss?(): void
}

export interface CameraProps {
  /** Every frame's visible barcode payloads (empty when none). */
  onCodes(codes: string[]): void
  style?: StyleProp<ViewStyle>
}

export interface SessionsPlatform {
  Icon: ComponentType<IconProps>
  Header: ComponentType<HeaderProps>
  Sheet: ComponentType<SheetProps>
  Menu: ComponentType<MenuProps>
  GlassButton: ComponentType<GlassButtonProps>
  /** Live preview with native torch/zoom controls (`CameraControls`) and pinch zoom over it. */
  Camera: ComponentType<CameraProps>
  present(dialog: Dialog): void
  requestCameraAccess(): Promise<'granted' | 'denied'>
  openSettings(): void
  /** True while the screen is the visible route (`useIsFocused`). Drives the attendance auto-refresh. */
  useIsFocused(): boolean
  /** Bottom safe-area inset of the current presentation, plus the tab bar on tab routes (floating button, sheet footers). */
  useBottomInset(): number
}
