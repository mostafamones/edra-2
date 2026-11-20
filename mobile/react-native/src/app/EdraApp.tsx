import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AppState, Pressable, View } from 'react-native'
import { ApiClient } from '../core/api.ts'
import type { AccountScope } from '../core/ownership.ts'
import { AccessRoot } from '../features/access/AccessRoot.tsx'
import type { AuthController } from '../features/access/auth.ts'
// Extensionless so Metro picks `platform.ios.ts` on iOS.
import { createPlatformAccess } from '../features/access/platform'
import type { PlatformAccess } from '../features/access/platformTypes.ts'
import { AssignmentsScreen } from '../features/assignments/AssignmentsScreen.tsx'
import { systemConfirm, type AssessmentPlatform } from '../features/assignments/platform.ts'
import { WorkspaceScreen } from '../features/assignments/WorkspaceScreen.tsx'
import { Avatar } from '../features/overview/Avatar.tsx'
import { OverviewScreen } from '../features/overview/OverviewScreen.tsx'
import { SettingsScreen } from '../features/overview/SettingsScreen.tsx'
import { Loading, Unavailable } from '../features/sessions/screens/parts.tsx'
import type { SessionsPlatform } from '../features/sessions/screens/platform.ts'
import { SessionScreen } from '../features/sessions/screens/SessionScreen.tsx'
import { SessionsHomeScreen } from '../features/sessions/screens/SessionsHomeScreen.tsx'
import { StartSessionSheet } from '../features/sessions/screens/StartSessionScreen.tsx'
import type { AppChrome, AppServices, EdraAppProps } from './contract.ts'
import { academyIcon, Shell, type SwitchGuard } from './shell.ts'

let processAccess: PlatformAccess | null = null

/**
 * The Edra instructor app below the foundation's providers (safe area, status bar, theme): sign-in, then the
 * signed-in shell per account scope. Port of the SwiftUI `RootView`, `SignedInRoot` and `ShellView`.
 */
export function EdraApp({ chrome, sessions, assessments, services, access: injected }: EdraAppProps) {
  // The platform authority is created once per process; one ApiClient per mounted authority shares its refresh.
  const access = injected ?? (processAccess ??= createPlatformAccess())
  const client = useMemo(
    () => (access.configured ? new ApiClient({ origin: access.apiOrigin, auth: access.authority, fetch: services.fetch, newId: services.newId }) : null),
    // The client must not change with the services object's identity.
    [access],
  )
  return (
    <AccessRoot
      access={access}
      signedIn={(auth, scope, configured) => (
        <SignedInShell auth={auth} scope={scope} client={client!} selection={configured.selection} services={services} chrome={chrome} sessions={sessions} assessments={assessments} />
      )}
    />
  )
}

type ShellProps = {
  auth: AuthController
  scope: AccountScope
  client: ApiClient
  selection: Extract<PlatformAccess, { configured: true }>['selection']
  services: AppServices
  chrome: AppChrome
  sessions: SessionsPlatform
  assessments: AssessmentPlatform
}

/** Mounted once per account scope (`AccessRoot` keys it), so every model and history starts fresh. */
function SignedInShell({ auth, scope, client, selection, services, chrome, sessions: sessionsPlatform, assessments: assessmentPlatform }: ShellProps) {
  const [shell] = useState(() => new Shell({ auth, scope, client, selection, services }))
  const { academies, profile } = shell
  useSyncExternalStore(shell.subscribe, () => shell.version)
  useSyncExternalStore(academies.subscribe, () => academies.version)
  useSyncExternalStore(profile.subscribe, () => profile.version)

  useEffect(() => void academies.load(), [academies])
  useEffect(() => void profile.load(), [profile])
  // Revalidate access whenever the app becomes active again (SwiftUI scenePhase `.active`).
  useEffect(() => {
    let last = AppState.currentState
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') void shell.foreground()
      last = next
    })
    return () => subscription.remove()
  }, [shell])

  const selected = academies.selected
  const context = academies.context
  const confirm = assessmentPlatform.confirm ?? systemConfirm

  const presentGuard = (guard: SwitchGuard) =>
    confirm({
      title: 'Save marks before switching academy?',
      actions: [
        { title: 'Save', disabled: !guard.marking.canRequestSave, onPress: () => void guard.save() },
        { title: 'Discard', role: 'destructive', onPress: guard.discard },
        { title: 'Keep editing', role: 'cancel' },
      ],
    })

  /**
   * A destination's root: its content only while an academy is selected, never a stale one. Overview always shows
   * its greeting and names the academy in its own picker instead of the subtitle.
   */
  const page = (title: string, content: ReactNode, trailing?: (diameter: number) => ReactNode, overview = false) => {
    const { state } = academies
    let body: ReactNode
    if (state.kind === 'loading' && !academies.academies.length) body = <Loading label="Loading academies…" />
    else if (state.kind === 'failed') body = <Unavailable title="Couldn't load academies" message={state.message} action="Retry" onAction={() => void academies.load()} />
    else if (selected) body = content
    else body = <Unavailable title="No staff access" message="Your account doesn't have active staff access to an academy." />
    return (
      <View style={{ flex: 1 }}>
        {(selected || overview) && <chrome.PageHeader title={title} subtitle={overview ? undefined : selected?.name} trailing={trailing} />}
        {body}
      </View>
    )
  }

  const startButton = (diameter: number) => (
    <sessionsPlatform.GlassButton icon="hugeicons-add-01" accessibilityLabel="Start session" diameter={diameter} onPress={() => shell.start.presentPicker()} />
  )

  // Without a name (none set, loading, failed, or a server without /api/v1/me) the greeting is just "Hello".
  const avatar = (diameter: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={shell.openSettings}>
      <Avatar uri={profile.avatarUrl} size={diameter * 0.85} />
    </Pressable>
  )

  const overview = page(
    profile.name ? `Hello, ${profile.name}` : 'Hello',
    <OverviewScreen
      academies={academies.academies}
      selectedId={context?.academyId ?? ''}
      icon={(a) => academyIcon(a.icon)}
      onChoose={(id) => {
        const guard = shell.chooseAcademy(id)
        if (guard) presentGuard(guard)
      }}
      sessions={shell.sessions}
      assignments={shell.activeAssignments}
      onOpenSession={shell.showSession}
      onOpenAssignment={shell.openAssignment}
      onShowSessions={() => shell.selectTab('sessions')}
      onShowAssessments={() => shell.selectTab('assessments')}
      onRefresh={() => Promise.all([shell.foreground(), shell.activeAssignments.load(academies.context)])}
      platform={sessionsPlatform}
    />,
    avatar,
    true,
  )

  const closeAssignment = () => shell.openAssignment(null)

  const comingSoon = (title: string) => (
    <chrome.Stack root={page(title, <Unavailable title="Coming soon" />)} routes={NO_ROUTES} onPop={noop} />
  )

  return (
    <>
      <chrome.Tabs
        selected={shell.tab}
        onSelect={shell.selectTab}
        tabs={[
          {
            key: 'overview',
            title: 'Overview',
            icon: 'hugeicons-home-01',
            content: (
              <chrome.Stack
                root={overview}
                routes={shell.settingsOpen ? [{ key: 'settings', element: <SettingsScreen platform={sessionsPlatform} name={profile.name} avatarUrl={profile.avatarUrl} onSignOut={shell.signOut} /> }] : NO_ROUTES}
                onPop={shell.popOverview}
              />
            ),
          },
          {
            key: 'sessions',
            title: 'Sessions',
            icon: 'hugeicons-calendar-clock',
            content: (
              <chrome.Stack
                root={page('Sessions', <SessionsHomeScreen context={context} sessions={shell.sessions} onOpen={shell.openSession} />, startButton)}
                routes={shell.sessionsPath.map(({ key, session }) => ({
                  key,
                  element: <SessionScreen key={key} session={session} makeModel={shell.makeSessionModel} platform={sessionsPlatform} />,
                }))}
                onPop={shell.popSessions}
              />
            ),
          },
          {
            key: 'assessments',
            title: 'Assessments',
            icon: 'hugeicons-file-edit',
            content: (
              <chrome.Stack
                root={page('Assessments', <AssignmentsScreen model={shell.assignments} platform={assessmentPlatform} open={chrome.modalRoutes ? null : shell.assignment} onOpen={shell.openAssignment} />)}
                routes={chrome.modalRoutes && shell.assignment && context ? [{
                  key: `assignment:${shell.assignment.id}`,
                  modal: true,
                  element: <WorkspaceScreen key={shell.assignment.id} summary={shell.assignment} context={context} parent={shell.assignments} platform={assessmentPlatform} onClose={closeAssignment} />,
                }] : NO_ROUTES}
                onPop={closeAssignment}
              />
            ),
          },
          { key: 'students', title: 'Students', icon: 'hugeicons-users', content: comingSoon('Students') },
          { key: 'concerns', title: 'Concerns', icon: 'hugeicons-bubble-chat', content: comingSoon('Concerns') },
        ]}
      />
      {selected && context && (
        <StartSessionSheet
          key={`${context.academyId}:${context.epoch}`}
          academy={{ name: selected.name, icon: academyIcon(selected.icon) }}
          context={context}
          schedules={shell.schedules}
          start={shell.start}
          platform={sessionsPlatform}
        />
      )}
    </>
  )
}

const NO_ROUTES: readonly never[] = []
const noop = () => {}
