import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { AssessmentPlatform } from '../assignments/platform.ts'
import { displayScore } from '../assignments/score.ts'
import { digits, font, useColors } from '../assignments/theme.ts'
import { LoadMoreRow, Row, Section, TextButton, useModel, useRefresh } from '../assignments/ui.tsx'
import type { SessionsPlatform } from '../sessions/screens/platform.ts'
import {
  ATTENDANCE_LABELS, KIND_TITLES, STATUS_LABELS, accessLabel, participationLabel, rateLabel, yearLabel,
  type AssessmentItem, type AssessmentKind, type AttendanceItem,
} from './api.ts'
import type { SectionState, StudentRecordModel } from './record.ts'

const KINDS: readonly AssessmentKind[] = ['assignment', 'quiz', 'exam']
const dateFormat = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

type Props = {
  name: string
  makeModel: () => StudentRecordModel
  platform: SessionsPlatform
  assessments: AssessmentPlatform
  /** Only assignments have a native workspace; quiz and exam results stay readable here. */
  onOpenAssignment: (item: AssessmentItem, refresh: () => void) => void
}

/** One annual student record: facts and contacts, finalized attendance and assessment history, each retried on its own. */
export function StudentScreen({ name, makeModel, platform, assessments, onOpenAssignment }: Props) {
  const [model] = useState(makeModel)
  useModel(model)
  const colors = useColors()
  const [refreshing, onRefresh] = useRefresh(() => model.load())

  useEffect(() => {
    void model.load()
    return () => model.cancel()
  }, [model])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void model.load()
    })
    return () => sub.remove()
  }, [model])

  return (
    <View style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <platform.Header title={model.detail?.fullName ?? name} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Facts model={model} />
        <Attendance model={model} />
        <Assessments model={model} platform={assessments} onOpen={(item) => onOpenAssignment(item, () => void model.loadAssessments())} />
      </ScrollView>
    </View>
  )
}

/** Loading or a failure with its own Retry, inside the section it belongs to. */
function SectionStatus({ state, title, onRetry }: { state: SectionState; title: string; onRetry: () => void }) {
  const colors = useColors()
  if (state.status === 'loading') {
    return (
      <Section header={title}>
        <Row>
          <ActivityIndicator accessibilityLabel={`Loading ${title.toLowerCase()}`} />
        </Row>
      </Section>
    )
  }
  if (state.status !== 'failed') return null
  return (
    <Section header={title}>
      <Row style={styles.failure}>
        <Text style={[font.subheadline, styles.grow, { color: colors.red }]}>{state.message}</Text>
        <TextButton title="Retry" onPress={onRetry} />
      </Row>
    </Section>
  )
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  const colors = useColors()
  return (
    <Row style={styles.field} accessibilityLabel={`${label}, ${value}`}>
      <Text style={[font.body, { color: colors.label }]}>{label}</Text>
      <Text selectable style={[font.body, styles.value, { color: tone ? colors.orange : colors.secondaryLabel }]}>{value}</Text>
    </Row>
  )
}

function Facts({ model }: { model: StudentRecordModel }) {
  const d = model.detail
  if (!d) return <SectionStatus state={model.detailState} title="Student" onRetry={() => void model.loadDetail()} />
  const access = accessLabel(d)
  return (
    <>
      <Section header="Student">
        <Field label="Year" value={`${yearLabel(d.academicYear)}${d.academicYear.closed ? ' · Closed' : ''}`} />
        <Field label="Level" value={d.levelName} />
        {d.trackName !== null && <Field label="Track" value={d.trackName} />}
        <Field label="Group" value={d.groupName ?? 'No group'} />
        <Field label="Type" value={participationLabel(d.participationType)} />
        {d.archived && <Field label="Record" value="Archived" tone="warning" />}
        <Field label="Online access" value={access} tone={access.includes('Suspended') ? 'warning' : undefined} />
      </Section>
      <Section header="Contacts">
        <Field label="Student" value={d.studentPhone} />
        <Field label="Parent" value={d.parentPhone} />
      </Section>
    </>
  )
}

function Attendance({ model }: { model: StudentRecordModel }) {
  const colors = useColors()
  const a = model.attendance
  if (a.state.status !== 'loaded' || !a.summary) return <SectionStatus state={a.state} title="Attendance" onRetry={() => void model.loadAttendance()} />
  const { mandatory, optional } = a.summary
  return (
    <>
      <Section header="Mandatory attendance">
        <Field label="Rate" value={rateLabel(mandatory.rate)} />
        <Counts counts={[['Present', mandatory.present], ['Late', mandatory.late], ['Absent', mandatory.absent]]} />
        <Counts counts={[['Excused', mandatory.excused], ['Unknown', mandatory.unknown]]} />
      </Section>
      {optional.present + optional.late + optional.absent + optional.excused + optional.unknown > 0 && (
        <Section header="Optional sessions">
          <Field label="Attended" value={String(optional.attended)} />
          <Counts counts={[['Absent', optional.absent], ['Excused', optional.excused], ['Unknown', optional.unknown]]} />
        </Section>
      )}
      <Section header={`Sessions · ${a.total}`}>
        {a.items.length === 0 ? (
          <Row>
            <Text style={[font.body, { color: colors.secondaryLabel }]}>No finalized attendance</Text>
          </Row>
        ) : (
          a.items.map((item) => <SessionRow key={item.sessionId} item={item} />)
        )}
        {a.items.length < a.total && (
          <LoadMoreRow isLoading={a.isLoadingMore} failed={a.loadMoreError !== null} shown={a.items.length} total={a.total} onPress={() => void model.loadMoreAttendance()} />
        )}
      </Section>
    </>
  )
}

function Counts({ counts }: { counts: readonly (readonly [string, number])[] }) {
  const colors = useColors()
  return (
    <Row style={styles.counts}>
      {counts.map(([label, value]) => (
        <View key={label} style={styles.count} accessible accessibilityLabel={`${label}, ${value}`}>
          <Text style={[font.title3Semibold, digits, { color: colors.label }]}>{value}</Text>
          <Text style={[font.footnote, { color: colors.secondaryLabel }]}>{label}</Text>
        </View>
      ))}
    </Row>
  )
}

function SessionRow({ item }: { item: AttendanceItem }) {
  const colors = useColors()
  const status = ATTENDANCE_LABELS[item.status] ?? item.status
  const tone = item.status === 'absent' ? colors.red : item.status === 'late' ? colors.orange : item.status === 'present' ? colors.green : colors.secondaryLabel
  const title = item.title ?? 'Session'
  const meta = [dateFormat(item.startedAt), item.groupName, item.mandatory ? null : 'Optional'].filter(Boolean).join(' · ')
  return (
    <Row style={styles.split} accessibilityLabel={`${title}, ${meta}, ${status}`}>
      <View style={styles.grow}>
        <Text style={[font.body, { color: colors.label }]}>{title}</Text>
        <Text style={[font.footnote, { color: colors.secondaryLabel }]}>{meta}</Text>
      </View>
      <Text style={[font.subheadlineMedium, { color: tone }]}>{status}</Text>
    </Row>
  )
}

function Assessments({ model, platform, onOpen }: { model: StudentRecordModel; platform: AssessmentPlatform; onOpen: (item: AssessmentItem) => void }) {
  const colors = useColors()
  const list = model.assessments
  let body: ReactNode
  if (list.state.status !== 'loaded') body = <SectionStatus state={list.state} title={KIND_TITLES[model.kind]} onRetry={() => void model.loadAssessments()} />
  else {
    body = (
      <Section header={`${KIND_TITLES[model.kind]} · ${list.total}`}>
        {list.items.length === 0 ? (
          <Row>
            <Text style={[font.body, { color: colors.secondaryLabel }]}>{`No ${KIND_TITLES[model.kind].toLowerCase()}`}</Text>
          </Row>
        ) : (
          list.items.map((item) => <AssessmentRow key={item.id} item={item} onPress={item.kind === 'assignment' ? () => onOpen(item) : undefined} />)
        )}
        {list.items.length < list.total && (
          <LoadMoreRow isLoading={list.isLoadingMore} failed={list.loadMoreError !== null} shown={list.items.length} total={list.total} onPress={() => void model.loadMoreAssessments()} />
        )}
      </Section>
    )
  }
  return (
    <>
      <View style={styles.segmented}>
        <platform.Segmented
          values={KINDS.map((k) => KIND_TITLES[k])}
          selectedIndex={KINDS.indexOf(model.kind)}
          onChange={(index) => void model.setKind(KINDS[index]!)}
          accessibilityLabel="Assessment type"
        />
      </View>
      {body}
    </>
  )
}

function AssessmentRow({ item, onPress }: { item: AssessmentItem; onPress?: () => void }) {
  const colors = useColors()
  const status = STATUS_LABELS[item.status]
  const { result } = item
  const tone = item.status === 'missing' ? colors.red : item.status === 'correction_pending' || item.status === 'marking_incomplete' ? colors.orange : colors.secondaryLabel
  const score = result ? `${displayScore(result.score)} / ${displayScore(result.maximum)}` : null
  const meta = result ? [result.percentage === null ? null : `${result.percentage}%`, `Announced ${dateFormat(result.announcedAt)}`].filter(Boolean).join(' · ') : null
  return (
    <Row onPress={onPress} style={styles.split} accessibilityLabel={[item.title, score, meta, status].filter(Boolean).join(', ')}>
      <View style={styles.grow}>
        <Text style={[font.body, { color: colors.label }]}>{item.title}</Text>
        {meta !== null && <Text style={[font.footnote, digits, { color: colors.secondaryLabel }]}>{meta}</Text>}
        {item.status !== 'announced' && <Text style={[font.footnote, { color: tone }]}>{status}</Text>}
      </View>
      {score !== null && <Text style={[font.bodySemibold, digits, { color: colors.label }]}>{score}</Text>}
    </Row>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 16, paddingBottom: 32 },
  grow: { flex: 1, gap: 2 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  value: { flexShrink: 1, textAlign: 'right' },
  failure: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counts: { flexDirection: 'row', justifyContent: 'space-around' },
  count: { alignItems: 'center', minWidth: 64 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segmented: { marginHorizontal: 16, marginBottom: 12 },
})
