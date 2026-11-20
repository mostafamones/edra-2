import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FeatureIcon } from '../../platform/chrome/FeatureIcon.tsx'
import type { Academy } from '../access/academies.ts'
import type { AssignmentSummary } from '../assignments/api.ts'
import type { AssignmentsModel } from '../assignments/assignments.ts'
import { useModel as useAssignments } from '../assignments/ui.tsx'
import type { LiveSession } from '../sessions/contract.ts'
import type { LiveSessionsModel } from '../sessions/live.ts'
import { sessionDetails, shortTime } from '../sessions/screens/format.ts'
import { useModel } from '../sessions/screens/hooks.ts'
import { Section, styles as parts } from '../sessions/screens/parts.tsx'
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
}>

/**
 * Overview root: every granted academy (name, role, current one checked; choosing another switches through the
 * shell's guard) and the current academy's live sessions and active assignments from the lists the shell already
 * loads. No counts: those lists are first pages. Other academies show no recap until a bounded per-academy read exists.
 */
export function OverviewScreen(props: OverviewProps) {
  const colors = useColors()
  const refresh = useRefresh(props.onRefresh)
  return (
    <ScrollView
      style={{ backgroundColor: colors.grouped }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl {...refresh} />}
    >
      <Section header="Academies">
        {props.academies.map((academy) => (
          <AcademyRow
            key={academy.id}
            academy={academy}
            icon={props.icon(academy)}
            current={academy.id === props.selectedId}
            onPress={() => props.onChoose(academy.id)}
          />
        ))}
      </Section>
      <LiveNow {...props} />
      <Assessments {...props} />
    </ScrollView>
  )
}

function AcademyRow({ academy, icon, current, onPress }: { academy: Academy; icon: string; current: boolean; onPress: () => void }) {
  const colors = useColors()
  const role = roleLabel(academy.role)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${academy.name}, ${role}`}
      accessibilityState={{ selected: current }}
      // Reselecting the current academy changes nothing (the controller ignores it).
      onPress={onPress}
      style={({ pressed }) => [parts.row, pressed && { backgroundColor: colors.fill }]}
    >
      <FeatureIcon name={icon} size={24} color={current ? colors.accent : colors.label} />
      <View style={styles.text}>
        <Text style={[type.headline, { color: colors.label }]}>{academy.name}</Text>
        <Text style={[type.subheadline, { color: colors.secondary }]}>{role}</Text>
      </View>
      {current && <FeatureIcon name="tick-02" size={20} color={colors.accent} />}
    </Pressable>
  )
}

function LiveNow({ sessions: model, onOpenSession, onShowSessions }: OverviewProps) {
  const { state, sessions } = useModel(model)
  const { shown, more } = overviewSessions(sessions)
  return (
    <Section header="Live now">
      {state.kind === 'failed' && !sessions.length ? (
        <RetryRow title="Couldn't load live sessions" onPress={() => void model.load(model.context)} />
      ) : !sessions.length ? (
        state.kind === 'loaded' ? <Note text="No live sessions" /> : <Pending label="Loading live sessions" />
      ) : (
        [
          ...shown.map((s) => (
            <LinkRow
              key={s.id}
              title={s.schedule_title}
              detail={[sessionDetails(s), `Started ${shortTime(s.started_at)}`].filter(Boolean).join(' · ')}
              onPress={() => onOpenSession(s)}
            />
          )),
          more && <LinkRow key="all" title="All live sessions" onPress={onShowSessions} accent />,
        ]
      )}
    </Section>
  )
}

function Assessments({ assignments: model, onOpenAssignment, onShowAssessments }: OverviewProps) {
  useAssignments(model)
  const { state, assignments, hasMore } = model
  const { shown, more } = overviewAssignments(assignments, hasMore)
  let rows: ReactNode
  if (state.status === 'failed' && !assignments.length) rows = <RetryRow title="Couldn't load assignments" onPress={() => void model.load(model.context)} />
  else if (state.status !== 'loaded' && !assignments.length) rows = <Pending label="Loading assignments" />
  else {
    rows = [
      // A later page may still hold active work, so "none" is only claimed for a complete list.
      ...(shown.length ? shown.map((a) => (
        <LinkRow key={a.id} title={a.title} detail={a.dueAt ? `Due ${dueDate(a.dueAt)}` : undefined} onPress={() => onOpenAssignment(a)} />
      )) : more ? [] : [<Note key="none" text="No active assignments" />]),
      more && <LinkRow key="all" title="All assignments" onPress={onShowAssessments} accent />,
    ]
  }
  return <Section header="Assessments">{rows}</Section>
}

const dueDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function LinkRow({ title, detail, onPress, accent }: { title: string; detail?: string; onPress: () => void; accent?: boolean }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, detail].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [parts.row, pressed && { backgroundColor: colors.fill }]}
    >
      <View style={styles.text}>
        <Text style={[type.body, { color: accent ? colors.accent : colors.label }]}>{title}</Text>
        {!!detail && <Text style={[type.subheadline, { color: colors.secondary }]}>{detail}</Text>}
      </View>
      <FeatureIcon name="chevron-right" size={16} color={colors.secondary} />
    </Pressable>
  )
}

function RetryRow({ title, onPress }: { title: string; onPress: () => void }) {
  const colors = useColors()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, Retry`} onPress={onPress} style={parts.row}>
      <Text style={[type.body, styles.text, { color: colors.secondary }]}>{title}</Text>
      <Text style={[type.body, { color: colors.accent }]}>Retry</Text>
    </Pressable>
  )
}

function Note({ text }: { text: string }) {
  const colors = useColors()
  return (
    <View style={parts.row}>
      <Text style={[type.body, { color: colors.secondary }]}>{text}</Text>
    </View>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <View style={parts.row} accessible accessibilityLabel={label}>
      <ActivityIndicator />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  text: { flex: 1, gap: 2 },
})
