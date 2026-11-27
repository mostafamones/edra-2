import type { ApiClient } from '../core/api.ts'
import { Model } from '../core/model.ts'
import type { AcademyContext, AccountScope } from '../core/ownership.ts'
import { AcademiesController, type Academy } from '../features/access/academies.ts'
import type { AuthController, SelectionStore } from '../features/access/auth.ts'
import type { AssignmentSummary } from '../features/assignments/api.ts'
import { AssignmentsModel } from '../features/assignments/assignments.ts'
import type { MarkingModel } from '../features/assignments/marking.ts'
import { bindRequestPort } from '../features/sessions/binding.ts'
import type { LiveSession } from '../features/sessions/contract.ts'
import { SessionDetailModel } from '../features/sessions/detail.ts'
import { LiveSessionsModel } from '../features/sessions/live.ts'
import { ProfileModel } from '../features/overview/profile.ts'
import { SchedulesModel } from '../features/sessions/schedules.ts'
import { StartSessionModel } from '../features/sessions/start.ts'
import type { AssessmentItem } from '../features/students/api.ts'
import { StudentDirectoryModel } from '../features/students/directory.ts'
import { StudentRecordModel } from '../features/students/record.ts'
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
export type StudentRoute = Readonly<{ key: string; recordId: string; name: string }>
/** An assignment workspace opened from a student record, focused on that annual record. */
export type StudentAssignment = Readonly<{
  key: string
  summary: AssignmentSummary
  focus: Readonly<{ recordId: string; name: string }>
  /** Refreshes the record's assessment history when the workspace closes. */
  onReturn: () => void
}>

/**
 * One account scope's signed-in shell (port of SwiftUI `SignedInRoot` + `ShellView` state): its models, the
 * selected tab and each tab's history. Built when the scope mounts; nothing carries over.
 */
export class Shell extends Model {
  tab: ShellTab = 'overview'
  /** Session screens belong to the selected academy; they close when the selection changes. */
  sessionsPath: readonly SessionRoute[] = []
  /** The open assessment workspace; it belongs to the selected academy too. */
  assignment: AssignmentSummary | null = null
  /** Overview's history: Settings (account-level, so an academy change keeps it). */
  settingsOpen = false
  /** Student records belong to the selected academy; they close when the selection changes. */
  studentsPath: readonly StudentRoute[] = []
  studentAssignment: StudentAssignment | null = null

  readonly academies: AcademiesController
  /** The account's own name and picture; account-level, so academy changes keep it. */
  readonly profile: ProfileModel
  readonly sessions: LiveSessionsModel
  readonly schedules: SchedulesModel
  readonly start: StartSessionModel
  readonly assignments: AssignmentsModel
  /** Overview's own active list, so the Assessments tab's status filter never changes the recap. */
  readonly activeAssignments: AssignmentsModel
  readonly students: StudentDirectoryModel

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
    this.profile = new ProfileModel({ api: client, scope, onUnauthenticated })
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
    const assignmentsEnv = {
      api: client,
      isCurrent,
      onUnauthenticated,
      onForbidden: owner.onForbidden,
      newKey: services.newId,
      feedback: services.feedback,
    }
    this.assignments = new AssignmentsModel(assignmentsEnv)
    this.activeAssignments = new AssignmentsModel(assignmentsEnv)
    this.students = new StudentDirectoryModel(assignmentsEnv)
    // A started (or opened) session: its identity comes from the server acknowledgment.
    this.start.subscribe(() => {
      const destination = this.start.destination
      if (!destination) return
      this.start.destination = null
      this.showSession(destination)
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

  /** From Overview: the Sessions tab with only this session open. */
  showSession = (session: LiveSession) => {
    this.tab = 'sessions'
    this.sessionsPath = [this.route(session)]
    this.changed()
  }

  /** Opens (or, with null, closes) an assessment workspace; from Overview it also selects Assessments. */
  openAssignment = (assignment: AssignmentSummary | null) => {
    if (assignment) this.tab = 'assessments'
    this.assignment = assignment
    this.changed()
  }

  openSettings = () => {
    this.settingsOpen = true
    this.changed()
  }

  /** A user pop of the Overview stack (Settings is its only route). */
  popOverview = (length: number) => {
    if (length > 0 || !this.settingsOpen) return
    this.settingsOpen = false
    this.changed()
  }

  /** A user pop. Back at the root, the session may have ended or been archived meanwhile: refresh the live list. */
  popSessions = (length: number) => {
    if (length >= this.sessionsPath.length) return
    this.sessionsPath = this.sessionsPath.slice(0, Math.max(0, length))
    this.changed()
    if (!this.sessionsPath.length) void this.sessions.load(this.academies.context)
  }

  /** Pushes a student record; the directory below keeps its search, filter and scroll position. */
  openStudent = (student: Readonly<{ id: string; fullName: string }>) => {
    this.studentsPath = [...this.studentsPath, { key: `${student.id}#${++this.pushes}`, recordId: student.id, name: student.fullName }]
    this.changed()
  }

  /** A user pop of the Students stack. */
  popStudents = (length: number) => {
    if (length >= this.studentsPath.length) return
    this.studentsPath = this.studentsPath.slice(0, Math.max(0, length))
    this.studentAssignment = null
    this.changed()
  }

  /** A record screen's model: it belongs to the account scope and academy selection it was opened in. */
  makeStudentModel = (recordId: string) => {
    const context = this.academies.context
    const isCurrent = this.academies.isCurrent
    return new StudentRecordModel(recordId, context ?? { academyId: '', epoch: -1 }, {
      api: this.deps.client,
      // A model made without a selection never commits anything.
      isCurrent: (c) => context !== null && isCurrent(c),
      onUnauthenticated: () => this.deps.auth.signOutFrom(this.deps.scope),
      onForbidden: this.academies.ownership.onForbidden,
    })
  }

  /**
   * Opens an assignment from a student record in the same workspace the Assessments tab uses (its permissions,
   * save and announce flows and the unsaved-marking guard), focused on the record.
   */
  openStudentAssignment = (item: AssessmentItem, focus: StudentAssignment['focus'], onReturn: () => void) => {
    if (item.kind !== 'assignment' || !this.academies.context) return
    const summary: AssignmentSummary = { id: item.id, title: item.title, dueAt: null, state: '', maxScore: '', recipientCount: 0 }
    this.studentAssignment = { key: `assignment:${item.id}#${++this.pushes}`, summary, focus, onReturn }
    this.changed()
  }

  closeStudentAssignment = () => {
    const open = this.studentAssignment
    if (!open) return
    this.studentAssignment = null
    this.changed()
    open.onReturn()
  }

  /** Overview academy choice. Returns a guard to present when the switch would lose unsaved marks; reselecting changes nothing. */
  chooseAcademy = (academyId: string): SwitchGuard | null => {
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

  /** Settings' Sign out; also reachable with zero academies. */
  signOut = () => {
    void this.deps.auth.signOut()
  }

  /**
   * The app became active: revalidate access (missed changes surface here or as a 403), then refresh live sessions.
   * The profile reloads alongside, which also renews its one-hour picture URL.
   */
  foreground = async () => {
    void this.profile.load()
    if (await this.academies.revalidate()) {
      const context = this.academies.context
      if (this.students.context) void this.students.refresh()
      await this.sessions.load(context)
    }
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
   * Switching or losing an academy (suspension, removal) returns to Overview and leaves its screens, which cancels
   * their work and drops pending edits, scan confirmations and any unacknowledged start, then loads the new
   * academy's lists.
   */
  private contextChanged(context: AcademyContext | null) {
    this.tab = 'overview'
    this.sessionsPath = []
    this.assignment = null
    this.studentsPath = []
    this.studentAssignment = null
    this.start.reset()
    void this.students.load(context)
    void this.sessions.load(context)
    // Prefetch the start picker's schedules so it opens already populated.
    if (context) void this.schedules.load(context)
    void this.assignments.load(context)
    void this.activeAssignments.load(context)
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
