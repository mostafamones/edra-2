import type { ApiClient } from '../core/api.ts'
import { Model } from '../core/model.ts'
import type { AcademyContext, AccountScope } from '../core/ownership.ts'
import { AcademiesController, type Academy } from '../features/access/academies.ts'
import type { AuthController, SelectionStore } from '../features/access/auth.ts'
import { AssignmentsModel } from '../features/assignments/assignments.ts'
import type { MarkingModel } from '../features/assignments/marking.ts'
import { bindRequestPort } from '../features/sessions/binding.ts'
import type { LiveSession } from '../features/sessions/contract.ts'
import { SessionDetailModel } from '../features/sessions/detail.ts'
import { LiveSessionsModel } from '../features/sessions/live.ts'
import { SchedulesModel } from '../features/sessions/schedules.ts'
import { StartSessionModel } from '../features/sessions/start.ts'
import type { AppServices, ShellTab } from './contract.ts'

export type ShellDeps = Readonly<{
  auth: Pick<AuthController, 'signOut' | 'signOutFrom'>
  scope: AccountScope
  /** The app's one client over the one auth authority, shared by every account scope. */
  client: ApiClient
  selection: SelectionStore
  services: AppServices
}>

/** A voluntary academy switch that would lose an unsaved marking draft: Save / Discard / Keep editing. */
export type SwitchGuard = Readonly<{
  academy: Academy
  marking: MarkingModel
  /** Saves the draft, then switches if the save was acknowledged and nothing changed the academy meanwhile. */
  save: () => Promise<void>
  discard: () => void
}>

export type SessionRoute = Readonly<{ key: string; session: LiveSession }>

/**
 * One account scope's signed-in shell (port of SwiftUI `SignedInRoot` + `ShellView` state): its models, the
 * selected tab, the Sessions history and the academy menu. Built when the scope mounts; nothing carries over.
 */
export class Shell extends Model {
  tab: ShellTab = 'sessions'
  /** Session screens belong to the selected academy; they close when the selection changes. */
  sessionsPath: readonly SessionRoute[] = []
  menuOpen = false

  readonly academies: AcademiesController
  readonly sessions: LiveSessionsModel
  readonly schedules: SchedulesModel
  readonly start: StartSessionModel
  readonly assignments: AssignmentsModel

  private readonly deps: ShellDeps
  private readonly api: ReturnType<typeof bindRequestPort>
  private pushes = 0

  constructor(deps: ShellDeps) {
    super()
    this.deps = deps
    const { auth, scope, client, selection, services } = deps
    // Every callback is bound to this account: a late 401 from it can't sign out the next one.
    const onUnauthenticated = () => auth.signOutFrom(scope)
    this.academies = new AcademiesController({
      api: client,
      scope,
      selection,
      onUnauthenticated,
      hasUnsavedChanges: () => this.assignments.switchNeedsConfirmation,
      onContextChange: (context) => this.contextChanged(context),
    })
    this.api = bindRequestPort(client, scope)
    const isCurrent = this.academies.isCurrent
    const owner = this.academies.ownership
    this.sessions = new LiveSessionsModel({ api: this.api, isCurrent, owner })
    this.schedules = new SchedulesModel({ api: this.api, isCurrent, owner })
    this.start = new StartSessionModel({
      api: this.api,
      isCurrent,
      owner,
      onStarted: (context) => this.sessions.load(context),
      newKey: services.newId,
    })
    this.assignments = new AssignmentsModel({
      api: client,
      isCurrent,
      onUnauthenticated,
      onForbidden: owner.onForbidden,
      newKey: services.newId,
      feedback: services.feedback,
    })
    // A started (or opened) session: its identity comes from the server acknowledgment.
    this.start.subscribe(() => {
      const destination = this.start.destination
      if (!destination) return
      this.start.destination = null
      this.tab = 'sessions'
      this.sessionsPath = [this.route(destination)]
      this.changed()
    })
  }

  selectTab = (tab: ShellTab) => {
    if (tab === this.tab) return
    this.tab = tab
    this.changed()
  }

  openSession = (session: LiveSession) => {
    this.sessionsPath = [...this.sessionsPath, this.route(session)]
    this.changed()
  }

  /** A user pop. Back at the root, the session may have ended or been archived meanwhile: refresh the live list. */
  popSessions = (length: number) => {
    if (length >= this.sessionsPath.length) return
    this.sessionsPath = this.sessionsPath.slice(0, Math.max(0, length))
    this.changed()
    if (!this.sessionsPath.length) void this.sessions.load(this.academies.context)
  }

  openMenu = () => {
    this.menuOpen = true
    this.changed()
  }

  closeMenu = () => {
    if (!this.menuOpen) return
    this.menuOpen = false
    this.changed()
  }

  /** Menu choice. Returns a guard to present when the switch would lose unsaved marks; reselecting changes nothing. */
  chooseAcademy = (academyId: string): SwitchGuard | null => {
    this.closeMenu()
    if (this.academies.choose(academyId) !== 'confirm') return null
    const academy = this.academies.pendingAcademy
    const marking = this.assignments.activeMarking
    // The dialog owns the choice from here; a dismissal without a choice must not leave a pending switch behind.
    this.academies.dismissPendingSwitch()
    if (!academy || !marking) return null
    const context = this.academies.context
    const unchanged = () => this.academies.context === context && this.assignments.activeMarking === marking
    return {
      academy,
      marking,
      save: async () => {
        if (!unchanged()) return
        if ((await marking.save()) && this.academies.context === context) this.academies.select(academy.id)
      },
      discard: () => {
        if (!unchanged()) return
        this.assignments.discardActiveMarking()
        this.academies.select(academy.id)
      },
    }
  }

  signOut = () => {
    this.closeMenu()
    void this.deps.auth.signOut()
  }

  /** The app became active: revalidate access (missed changes surface here or as a 403), then refresh live sessions. */
  foreground = async () => {
    if (await this.academies.revalidate()) await this.sessions.load(this.academies.context)
  }

  /** The session screen belongs to the account scope and academy selection it was opened in. */
  makeSessionModel = (session: LiveSession) => {
    const context = this.academies.context
    return new SessionDetailModel(session, {
      api: this.api,
      isCurrent: () => !!context && this.academies.isCurrent(context),
      owner: this.academies.ownership,
      newKey: this.deps.services.newId,
      lateAfter: this.deps.services.lateDeadlines(session.academy_id),
    })
  }

  /**
   * Switching or losing an academy (suspension, removal) leaves its screens, which cancels their work and drops
   * pending edits, scan confirmations and any unacknowledged start, then loads the new academy's lists.
   */
  private contextChanged(context: AcademyContext | null) {
    this.tab = 'sessions'
    this.sessionsPath = []
    this.start.reset()
    void this.sessions.load(context)
    // Prefetch the start picker's schedules so it opens already populated.
    if (context) void this.schedules.load(context)
    void this.assignments.load(context)
    this.changed()
  }

  private route(session: LiveSession): SessionRoute {
    return { key: `${session.id}#${++this.pushes}`, session }
  }
}

/** The API's academy icon id → bundled Hugeicons asset (`Academy.iconAsset` in the SwiftUI app). */
export function academyIcon(icon: string): string {
  return ACADEMY_ICONS.get(icon) ?? 'hugeicons-school-01'
}

const ACADEMY_ICONS = new Map([
  ['book', 'hugeicons-book-open-01'],
  ['graduate', 'hugeicons-graduation-cap'],
  ['science', 'hugeicons-microscope'],
  ['code', 'hugeicons-code'],
  ['art', 'hugeicons-paint-board'],
  ['music', 'hugeicons-music-note-01'],
  ['trophy', 'hugeicons-trophy'],
  ['world', 'hugeicons-globe-02'],
])
