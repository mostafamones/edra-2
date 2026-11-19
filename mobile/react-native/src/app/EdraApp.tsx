import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AppState, View } from 'react-native'
import { ApiClient } from '../core/api.ts'
import type { AccountScope } from '../core/ownership.ts'
import { AccessRoot } from '../features/access/AccessRoot.tsx'
import type { AuthController } from '../features/access/auth.ts'
// Extensionless so Metro picks `platform.ios.ts` on iOS.
import { createPlatformAccess } from '../features/access/platform'
import type { PlatformAccess } from '../features/access/platformTypes.ts'
import { AssignmentsScreen } from '../features/assignments/AssignmentsScreen.tsx'
import { systemConfirm, type AssessmentPlatform } from '../features/assignments/platform.ts'
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
  const { academies } = shell
  useSyncExternalStore(shell.subscribe, () => shell.version)
  useSyncExternalStore(academies.subscribe, () => academies.version)

  useEffect(() => void academies.load(), [academies])
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

  /** A destination's root: its content only while an academy is selected, never a stale one. */
  const page = (title: string, content: ReactNode, trailing?: (diameter: number) => ReactNode) => {
    const { state } = academies
    let body: ReactNode
    if (state.kind === 'loading' && !academies.academies.length) body = <Loading label="Loading academies…" />
    else if (state.kind === 'failed') body = <Unavailable title="Couldn't load academies" message={state.message} action="Retry" onAction={() => void academies.load()} />
    else if (selected) body = content
    else body = <Unavailable title="No staff access" message="Your account doesn't have active staff access to an academy." />
    return (
      <View style={{ flex: 1 }}>
        {selected && <chrome.PageHeader title={title} subtitle={selected.name} trailing={trailing} />}
        {body}
      </View>
    )
  }

  const startButton = (diameter: number) => (
    <sessionsPlatform.GlassButton icon="hugeicons-add-01" accessibilityLabel="Start session" diameter={diameter} onPress={() => shell.start.presentPicker()} />
  )

  return (
    <>
      <chrome.Tabs
        selected={shell.tab}
        onSelect={shell.selectTab}
        academy={{
          title: 'Academy',
          icon: selected ? academyIcon(selected.icon) : 'hugeicons-school-01',
          accessibilityLabel: selected ? `Switch academy, current: ${selected.name}` : 'Switch academy',
          onPress: shell.openMenu,
        }}
        tabs={[
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
            content: <chrome.Stack root={page('Assessments', <AssignmentsScreen model={shell.assignments} platform={assessmentPlatform} />)} routes={NO_ROUTES} onPop={noop} />,
          },
        ]}
      />
      <chrome.AcademyMenu
        open={shell.menuOpen}
        onClose={shell.closeMenu}
        academies={academies.academies.map((a) => ({ id: a.id, name: a.name, icon: academyIcon(a.icon) }))}
        selectedId={context?.academyId ?? null}
        onSelect={(id) => {
          const guard = shell.chooseAcademy(id)
          if (guard) presentGuard(guard)
        }}
        onSignOut={shell.signOut}
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
