import { useEffect, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { AssignmentSummary } from './api.ts'
import type { AssignmentsModel } from './assignments.ts'
import type { AssessmentPlatform } from './platform.ts'
import { font, useColors } from './theme.ts'
import { LoadMoreRow, Row, Section, Spinner, Unavailable, useModel, useRefresh } from './ui.tsx'
import { isOverdue } from './views.ts'
import { WorkspaceScreen } from './WorkspaceScreen.tsx'

/**
 * Assessments root (AssignmentsView.swift): active and closed assignments, including overdue ones.
 * The shell owns the "Assessments" page chrome, `model.load(context)` on every context change and the
 * academy-switch guard (`model.switchNeedsConfirmation`).
 */
export function AssignmentsScreen({ model, platform }: { model: AssignmentsModel; platform: AssessmentPlatform }) {
  useModel(model)
  // The open workspace. It has its own tab bar (Students, Scan, search), so it covers the app's.
  const [open, setOpen] = useState<AssignmentSummary | null>(null)
  const context = model.context
  // A different academy (or lost access) closes the workspace and drops its drafts.
  const contextKey = context && `${context.academyId}:${context.epoch}`
  useEffect(() => setOpen(null), [contextKey])

  return (
    <>
      <Content model={model} platform={platform} onOpen={setOpen} />
      <platform.Sheet visible={open !== null && context !== null} presentation="fullScreen" onDismiss={() => setOpen(null)}>
        {open && context && <WorkspaceScreen key={open.id} summary={open} context={context} parent={model} platform={platform} onClose={() => setOpen(null)} />}
      </platform.Sheet>
    </>
  )
}

function Content({ model, platform, onOpen }: { model: AssignmentsModel; platform: AssessmentPlatform; onOpen: (a: AssignmentSummary) => void }) {
  const colors = useColors()
  const [refreshing, onRefresh] = useRefresh(() => model.load(model.context))
  const { state, assignments } = model
  const empty = assignments.length === 0
  if (state.status === 'idle' || (state.status === 'loading' && empty)) return <Spinner />
  if (state.status === 'failed' && empty) {
    return <Unavailable platform={platform} title="Couldn't load assignments" message={state.message} action="Retry" onAction={() => void model.load(model.context)} />
  }
  if (empty) return <Unavailable platform={platform} title="No assignments" icon="file-edit" />
  // shortcut: not virtualized; pages are 50 rows behind "Load more". Use a SectionList if lists grow past a few hundred.
  return (
    <ScrollView
      style={{ backgroundColor: colors.groupedBackground }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Section>
        {assignments.map((a) => (
          <AssignmentRow key={a.id} assignment={a} onPress={() => onOpen(a)} />
        ))}
        {model.hasMore && (
          <LoadMoreRow isLoading={model.isLoadingMore} failed={model.loadMoreError !== null} shown={assignments.length} total={model.total} onPress={() => void model.loadMore()} />
        )}
        {model.hasMore && model.loadMoreError !== null && (
          <Row>
            <Text style={[font.footnote, { color: colors.red }]}>{model.loadMoreError}</Text>
          </Row>
        )}
      </Section>
    </ScrollView>
  )
}

const dueFormat = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function AssignmentRow({ assignment, onPress }: { assignment: AssignmentSummary; onPress: () => void }) {
  const colors = useColors()
  const closed = assignment.state === 'closed'
  const due = assignment.dueAt
  return (
    <Row onPress={onPress} style={styles.row}>
      <Text style={[font.headline, { color: colors.label }]}>{assignment.title}</Text>
      <View style={styles.meta}>
        {closed && <Text style={[font.subheadline, { color: colors.orange }]}>Closed</Text>}
        {due !== null && (
          <Text style={[font.subheadline, { color: isOverdue(due, assignment.state, Date.now()) ? colors.red : colors.secondaryLabel }]}>{`Due ${dueFormat(due)}`}</Text>
        )}
        <Text style={[font.subheadline, { color: colors.secondaryLabel }]}>{`${assignment.recipientCount} students`}</Text>
      </View>
    </Row>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 16 },
  row: { gap: 4, paddingVertical: 13 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 },
})
