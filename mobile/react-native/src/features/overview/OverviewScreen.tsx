import { Fragment, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { FeatureIcon } from '../../platform/chrome/FeatureIcon.tsx'
import type { Academy } from '../access/academies.ts'
import type { AssignmentSummary } from '../assignments/api.ts'
import type { AssignmentsModel } from '../assignments/assignments.ts'
import { useModel as useAssignments } from '../assignments/ui.tsx'
import type { LiveSession } from '../sessions/contract.ts'
import type { LiveSessionsModel } from '../sessions/live.ts'
import { sessionDetails, shortTime } from '../sessions/screens/format.ts'
import { useModel } from '../sessions/screens/hooks.ts'
import type { SessionsPlatform } from '../sessions/screens/platform.ts'
import { useRefresh } from '../sessions/screens/SessionsHomeScreen.tsx'
import { type, useColors } from '../sessions/screens/theme.ts'
import { overviewAssignments, overviewSessions, roleLabel } from './recap.ts'

export type OverviewProps = Readonly<{
  academies: readonly Academy[]
  selectedId: string
  icon: (academy: Academy) => string
  onChoose: (academyId: string) => void
  sessions: LiveSessionsModel
  assignments: AssignmentsModel
  onOpenSession: (session: LiveSession) => void
  onOpenAssignment: (assignment: AssignmentSummary) => void
  onShowSessions: () => void
  onShowAssessments: () => void
  onRefresh: () => Promise<unknown>
  platform: Pick<SessionsPlatform, 'PillMenu' | 'useBottomInset'>
}>

/**
 * Overview root: a compact native menu for the selected academy (choosing another switches through the shell's
 * guard) and the current academy's live sessions and active assignments from the lists the shell already loads.
 * No counts: those lists are first pages.
 */
export function OverviewScreen(props: OverviewProps) {
  const colors = useColors()
  const refresh = useRefresh(props.onRefresh)
  const bottom = props.platform.useBottomInset()
  return (
    <ScrollView
      style={{ backgroundColor: colors.grouped }}
      contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl {...refresh} />}
    >
      <AcademyPicker {...props} />
      <LiveNow {...props} />
      <Assessments {...props} />
    </ScrollView>
  )
}

/**
 * Edra green for links. Shared `colors.accent` resolves the iOS `AccentColor` asset, which the generated app may
 * lack (it then draws nothing), so Overview uses the brand values directly; dark is lightened for text contrast.
 */
function useLink() {
  return useColorScheme() === 'dark' ? '#2E9F5B' : '#008236'
}

function AcademyPicker({ academies, selectedId, icon, onChoose, platform: { PillMenu } }: OverviewProps) {
  const current = academies.find((a) => a.id === selectedId)
  if (!current) return null
  return (
    <View style={styles.picker}>
      <PillMenu
        title={current.name}
        icon={icon(current)}
        accessibilityLabel={`Academy, ${current.name}, ${roleLabel(current.role)}`}
        items={academies.map((a) => ({
          key: a.id,
          title: a.name,
          icon: icon(a),
          checked: a.id === selectedId,
          // Reselecting the current academy changes nothing (the controller ignores it).
          onPress: () => onChoose(a.id),
        }))}
      />
    </View>
  )
}

function LiveNow({ sessions: model, onOpenSession, onShowSessions }: OverviewProps) {
  const { state, sessions } = useModel(model)
  const { shown } = overviewSessions(sessions)
  let rows: ReactNode
  if (state.kind === 'failed' && !sessions.length) rows = <RetryRow title="Couldn't load live sessions" onPress={() => void model.load(model.context)} />
  else if (!sessions.length) rows = state.kind === 'loaded' ? <Note text="No live sessions" /> : <Pending label="Loading live sessions" />
  else {
    rows = shown.map((s) => (
      <LinkRow
        key={s.id}
        live
        title={s.schedule_title}
        detail={[sessionDetails(s), `Started ${shortTime(s.started_at)}`].filter(Boolean).join(' · ')}
        onPress={() => onOpenSession(s)}
      />
    ))
  }
  return <Recap title="Live now" onViewAll={onShowSessions} viewAllLabel="View all sessions">{rows}</Recap>
}

function Assessments({ assignments: model, onOpenAssignment, onShowAssessments }: OverviewProps) {
  useAssignments(model)
  const { state, assignments, hasMore } = model
  const { shown, more } = overviewAssignments(assignments, hasMore)
  let rows: ReactNode
  if (state.status === 'failed' && !assignments.length) rows = <RetryRow title="Couldn't load assignments" onPress={() => void model.load(model.context)} />
  else if (state.status !== 'loaded' && !assignments.length) rows = <Pending label="Loading assignments" />
  // A later page may still hold active work, so "none" is only claimed for a complete list.
  else if (!shown.length) rows = more ? null : <Note text="No active assignments" />
  else {
    rows = shown.map((a) => (
      <LinkRow key={a.id} title={a.title} detail={a.dueAt ? `Due ${dueDate(a.dueAt)}` : undefined} onPress={() => onOpenAssignment(a)} />
    ))
  }
  return <Recap title="Assessments" onViewAll={onShowAssessments} viewAllLabel="View all assessments">{rows}</Recap>
}

const dueDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** A flat recap: header with a "View all" link to the tab, then hairline-separated rows on the page background. */
function Recap({ title, onViewAll, viewAllLabel, children }: { title: string; onViewAll: () => void; viewAllLabel: string; children: ReactNode }) {
  const colors = useColors()
  const link = useLink()
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <View style={styles.recap}>
      <View style={styles.recapHeader}>
        <Text accessibilityRole="header" style={[type.title3, styles.flex, { color: colors.label }]}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={viewAllLabel} hitSlop={8} onPress={onViewAll}
          style={({ pressed }) => [styles.viewAll, pressed && { opacity: 0.5 }]}>
          <Text style={[type.subheadline, styles.semibold, { color: link }]}>View all</Text>
        </Pressable>
      </View>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={[styles.hairline, { backgroundColor: colors.separator }]} />}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

function LinkRow({ title, detail, onPress, live }: { title: string; detail?: string; onPress: () => void; live?: boolean }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, detail].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
    >
      {live && <View style={[styles.dot, { backgroundColor: colors.green }]} />}
      <View style={styles.text}>
        <Text style={[type.body, styles.medium, { color: colors.label }]}>{title}</Text>
        {!!detail && <Text style={[type.subheadline, { color: colors.secondary }]}>{detail}</Text>}
      </View>
      <FeatureIcon name="chevron-right" size={14} color={colors.secondary} />
    </Pressable>
  )
}

function RetryRow({ title, onPress }: { title: string; onPress: () => void }) {
  const colors = useColors()
  const link = useLink()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, Retry`} onPress={onPress} style={styles.row}>
      <Text style={[type.body, styles.flex, { color: colors.secondary }]}>{title}</Text>
      <Text style={[type.body, styles.semibold, { color: link }]}>Retry</Text>
    </Pressable>
  )
}

function Note({ text }: { text: string }) {
  const colors = useColors()
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: colors.secondary }]}>{text}</Text>
    </View>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <ActivityIndicator />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { gap: 28 },
  picker: { paddingHorizontal: 20 },
  recap: { gap: 2 },
  recapHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 6 },
  viewAll: { minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, gap: 2 },
  flex: { flex: 1 },
  medium: { fontWeight: '500' },
  semibold: { fontWeight: '600' },
})
