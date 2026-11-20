import type { ComponentType, ReactNode } from 'react'
import type { Fetch } from '../core/api.ts'
import type { PlatformAccess } from '../features/access/platformTypes.ts'
import type { AssessmentPlatform } from '../features/assignments/platform.ts'
import type { Feedback } from '../features/assignments/environment.ts'
import type { LateAfterStore } from '../features/sessions/detail.ts'
import type { SessionsPlatform } from '../features/sessions/screens/platform.ts'

// What the foundation injects into `EdraApp`. The composition owns every piece of state (selected tab, each
// tab's history, resets); these components only draw native chrome for it.

export type ShellTab = 'overview' | 'sessions' | 'assessments' | 'students' | 'concerns'

export type TabsProps = Readonly<{
  tabs: readonly Readonly<{ key: ShellTab; title: string; icon: string; content: ReactNode }>[]
  selected: ShellTab
  onSelect: (tab: ShellTab) => void
}>

/**
 * A controlled native stack. `root` has no navigation bar (it draws `PageHeader`); pushed routes draw their own
 * bar through `SessionsPlatform.Header`. `onPop(length)` reports a user pop (back button, swipe) to `length` routes.
 */
export type StackProps = Readonly<{
  root: ReactNode
  /** `modal`: presented full screen over the tabs (only where `AppChrome.modalRoutes`); it draws its own bars. */
  routes: readonly Readonly<{ key: string; element: ReactNode; modal?: boolean }>[]
  onPop: (length: number) => void
}>

/** Photos-style large title with the academy name beneath; `trailing` builds the title-row button for a diameter. */
export type PageHeaderProps = Readonly<{ title: string; subtitle?: string; trailing?: (diameter: number) => ReactNode }>

export type AppChrome = Readonly<{
  Tabs: ComponentType<TabsProps>
  Stack: ComponentType<StackProps>
  PageHeader: ComponentType<PageHeaderProps>
  /** iOS: the assignment workspace is a native full-screen modal route, not a React Native Modal. */
  modalRoutes: boolean
}>

export type AppServices = Readonly<{
  /** Web `fetch` (global in React Native). */
  fetch: Fetch
  /** UUID v4 source for request ids and Idempotency-Keys (Hermes may lack `crypto.randomUUID`). */
  newId: () => string
  /**
   * Per-academy Late-after minutes kept on this device (iOS: `lateAfterMinutes.<sessionId>` UserDefaults keys).
   * Synchronous reads: the session screen shows the stored value when it opens.
   */
  lateDeadlines: (academyId: string) => LateAfterStore
  /** Haptics for marking and scanning. */
  feedback?: (kind: Feedback) => void
}>

export type EdraAppProps = Readonly<{
  chrome: AppChrome
  sessions: SessionsPlatform
  assessments: AssessmentPlatform
  services: AppServices
  /** Defaults to this process's `createPlatformAccess()`; tests inject one. */
  access?: PlatformAccess
}>
