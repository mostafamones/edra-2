import { useEffect, useState, type ReactNode } from 'react'
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { AcademyContext } from '../../core/ownership.ts'
import { studentStatus, type AssignmentSummary, type StudentWork } from './api.ts'
import type { AssignmentsModel } from './assignments.ts'
import { MarkingSheet } from './MarkingSheet.tsx'
import { systemAlert, type AssessmentPlatform, type BarItem, type Pane } from './platform.ts'
import { ScanPane } from './ScanPane.tsx'
import { displayScore } from './score.ts'
import { digits, font, useColors } from './theme.ts'
import { FilterChip, LoadMoreRow, Row, ScoreText, Section, Spinner, Unavailable, useModel, useRefresh } from './ui.tsx'
import {
  SEARCH_PROMPT,
  accessStatus,
  announceDone,
  announceStatus,
  countLabel,
  rejection,
  statusTone,
  studentDetails,
  studentsEmptyTitle,
  tabAction,
  workspaceTabs,
} from './views.ts'
import { FILTERS, WorkspaceModel } from './workspace.ts'

type Props = { summary: AssignmentSummary; context: AcademyContext; parent: AssignmentsModel; platform: AssessmentPlatform; onClose: () => void }

/** One assignment (WorkspaceView.swift): server-searched students with filters, marking entry points and announcement. */
export function WorkspaceScreen({ summary, context, parent, platform, onClose }: Props) {
  const [model] = useState(() => new WorkspaceModel(summary, context, parent))
  useModel(model)
  const [searchText, setSearchText] = useState('')
  const [pane, setPane] = useState<Pane>('students')

  // Loaded once; returning from another tab keeps the list, its paging and any selection. Closing cancels.
  useEffect(() => {
    if (model.detail === null) void model.load()
    return () => model.cancel()
  }, [model])
  // Search runs on the server across every student; debounce typing.
  useEffect(() => {
    const timer = setTimeout(() => void model.setSearch(searchText), 300)
    return () => clearTimeout(timer)
  }, [model, searchText])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void model.resumed()
    })
    return () => sub.remove()
  }, [model])

  const lookupError = pane === 'scan' ? null : model.lookupError
  useEffect(() => {
    if (lookupError !== null) systemAlert('Code not accepted', lookupError, () => model.dismissLookupError())
  }, [model, lookupError])
  const notice = model.notice
  useEffect(() => {
    if (notice !== null) systemAlert(notice, undefined, () => model.dismissNotice())
  }, [model, notice])

  const select = (next: Pane) => {
    if (tabAction(next, model.isSelecting) === 'review') return model.reviewSelection()
    // Leaving search shows every student again.
    if (next !== 'search') setSearchText('')
    setPane(next)
  }

  const title = model.detail?.title ?? model.summary.title
  // No action bar while selecting; a close button replaces Back so the mode can be left.
  const leading: BarItem = model.isSelecting
    ? { kind: 'icon', icon: 'cancel-01', label: 'Cancel selection', onPress: () => model.setSelecting(false) }
    : { kind: 'icon', icon: 'chevron-left', label: 'Back', onPress: onClose }
  // Without a search tab there is nothing to turn into the confirm button.
  const trailing: BarItem | null =
    model.isSelecting && !platform.hasSearchTab
      ? { kind: 'text', title: `Announce ${model.selection.size}`, onPress: () => model.reviewSelection(), disabled: model.selection.size === 0 }
      : null
  const page = (content: ReactNode, search = false) => (
    <platform.NavigationBar title={title} leading={leading} trailing={trailing} search={search ? { text: searchText, onChange: setSearchText, prompt: SEARCH_PROMPT } : null}>
      {content}
    </platform.NavigationBar>
  )

  // The sheet's swipe-to-dismiss guard follows the draft.
  const marking = useModel(model.marking)
  const announcement = model.announcement
  return (
    <>
      {model.state.status === 'loading' ? (
        page(<Spinner />)
      ) : model.state.status === 'failed' ? (
        page(<Unavailable platform={platform} title="Couldn't load this assignment" message={model.state.message} action="Retry" onAction={() => void model.load()} />)
      ) : (
        <platform.Tabs
          tabs={workspaceTabs(model.scanAvailable, model.isSelecting, platform.hasSearchTab)}
          selected={pane}
          onSelect={select}
          searchText={searchText}
          onSearchText={setSearchText}
          searchPrompt={SEARCH_PROMPT}
          render={(p) =>
            p === 'scan' ? page(<ScanPane model={model} platform={platform} />) : page(<StudentsPage model={model} platform={platform} />, p === 'students' && !platform.hasSearchTab)
          }
        />
      )}
      <platform.Sheet visible={marking !== null} presentation="sheet" dismissDisabled={marking !== null && !marking.canDismiss} onDismiss={() => model.closeMarking()}>
        {marking && <MarkingSheet key={marking.student.id} model={marking} platform={platform} onClose={() => model.closeMarking()} />}
      </platform.Sheet>
      <platform.Sheet
        visible={announcement !== null}
        presentation="sheet"
        dismissDisabled={announcement?.state.status === 'sending'}
        onDismiss={() => model.closeAnnouncement()}
      >
        {announcement && <AnnounceSheet model={model} platform={platform} />}
      </platform.Sheet>
    </>
  )
}

function StudentsPage({ model, platform }: { model: WorkspaceModel; platform: AssessmentPlatform }) {
  const colors = useColors()
  const status = accessStatus(model.actions, model.detail?.state)
  return (
    <View style={[styles.page, { backgroundColor: colors.groupedBackground }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersBar} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <FilterChip key={f.value} title={f.title} selected={model.filter === f.value} onPress={() => void model.setFilter(f.value)} />
        ))}
      </ScrollView>
      {status !== null && <Text style={[font.subheadlineMedium, styles.access, { color: colors.secondaryLabel }]}>{status}</Text>}
      <Students model={model} platform={platform} />
    </View>
  )
}

/** The empty state replaces the list; filters and search stay available above it. */
function Students({ model, platform }: { model: WorkspaceModel; platform: AssessmentPlatform }) {
  const [refreshing, onRefresh] = useRefresh(() => model.reloadStudents())
  const { listState, students } = model
  if (listState.status === 'loading' && students.length === 0) return <Spinner />
  if (listState.status === 'failed') {
    return <Unavailable platform={platform} title="Couldn't load students" message={listState.message} action="Retry" onAction={() => void model.reloadStudents()} />
  }
  if (students.length === 0) return <Unavailable platform={platform} title={studentsEmptyTitle(model.search, model.filter)} icon="users" />
  return (
    <ScrollView
      style={styles.page}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Section header={`${model.total} students`}>
        {students.map((s) => (
          <StudentRow key={s.id} model={model} platform={platform} student={s} />
        ))}
        {model.hasMore && <LoadMoreRow isLoading={model.isLoadingMore} failed={model.loadMoreError !== null} shown={students.length} total={model.total} onPress={() => void model.loadMore()} />}
      </Section>
    </ScrollView>
  )
}

function StudentRow({ model, platform, student }: { model: WorkspaceModel; platform: AssessmentPlatform; student: StudentWork }) {
  const colors = useColors()
  const selected = model.selection.has(student.id)
  const blocked = model.announceBlocker(student) !== null
  const status = studentStatus(student)
  const tone = statusTone(status)
  const details = studentDetails(student)
  const menu =
    model.actions.announce && !model.isSelecting
      ? [
          { title: 'Announce result', disabled: blocked, onPress: () => model.reviewAnnouncement([student]) },
          { title: 'Select', onPress: () => model.startSelecting(student) },
        ]
      : []
  return (
    <platform.ContextMenu actions={menu}>
      <Row selected={model.isSelecting ? selected : undefined} onPress={() => (model.isSelecting ? model.toggleSelected(student) : model.open(student, 'row'))} style={styles.studentRow}>
        {model.isSelecting && (
          <View style={{ opacity: blocked ? 0.3 : 1 }}>
            <platform.Icon name={selected ? 'checkmark-circle-02' : 'circle'} size={20} color={colors.accent} />
          </View>
        )}
        <View style={styles.grow}>
          <Text style={[font.bodyMedium, { color: colors.label }]}>{student.fullName}</Text>
          <Text style={[font.footnote, { color: colors.secondaryLabel }]}>{details}</Text>
        </View>
        <View style={styles.trailing}>
          <ScoreText total={student.total} max={model.detail?.maxScore} style={font.subheadline} />
          <Text style={[font.footnote, { color: tone === 'green' ? colors.green : tone === 'orange' ? colors.orange : colors.secondaryLabel }]}>{status}</Text>
        </View>
      </Row>
    </platform.ContextMenu>
  )
}

/** Confirms an announcement: names, count, saved totals and corrections. All or nothing. */
function AnnounceSheet({ model, platform }: { model: WorkspaceModel; platform: AssessmentPlatform }) {
  const colors = useColors()
  const announcement = model.announcement!
  const { state } = announcement
  const done = announceDone(state)
  const message = announceStatus(state)
  const trailing: BarItem | null =
    state.status === 'sending'
      ? { kind: 'progress' }
      : done
        ? null
        : {
            kind: 'text',
            title: state.status === 'uncertain' ? 'Retry' : 'Announce',
            prominent: true,
            disabled: announcement.students.some((s) => model.announceBlocker(s) !== null),
            onPress: () => void model.announce(),
          }
  return (
    <platform.NavigationBar
      title="Announce?"
      leading={{ kind: 'icon', icon: 'cancel-01', label: done ? 'Close' : 'Cancel', disabled: state.status === 'sending', onPress: () => model.closeAnnouncement() }}
      trailing={trailing}
    >
      <ScrollView style={{ backgroundColor: colors.groupedBackground }} contentContainerStyle={styles.sheetContent}>
        <Section header={countLabel(announcement.students.length)}>
          {announcement.students.map((s) => {
            const reason = rejection(announcement, s) ?? model.announceBlocker(s)
            return (
              <Row key={s.id} style={styles.announceRow}>
                <View style={styles.grow}>
                  <Text style={[font.body, { color: colors.label }]}>{s.fullName}</Text>
                  {reason !== null ? (
                    <Text style={[font.footnote, { color: colors.red }]}>{reason}</Text>
                  ) : s.publicationState === 'pending_correction' ? (
                    <Text style={[font.footnote, { color: colors.orange }]}>{`Correction · official ${displayScore(s.publication?.total)}`}</Text>
                  ) : null}
                </View>
                <ScoreText total={s.total} max={model.detail?.maxScore} style={{ ...font.body, ...digits }} />
              </Row>
            )
          })}
        </Section>
        {message !== null && (
          <Section>
            <Row>
              <Text style={[font.body, { color: colors.red }]}>{message}</Text>
            </Row>
          </Section>
        )}
      </ScrollView>
    </platform.NavigationBar>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grow: { flex: 1, gap: 2 },
  filtersBar: { flexGrow: 0 },
  filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  access: { paddingHorizontal: 20, paddingBottom: 6 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trailing: { alignItems: 'flex-end', gap: 2, marginLeft: 8 },
  announceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetContent: { paddingTop: 16 },
})
