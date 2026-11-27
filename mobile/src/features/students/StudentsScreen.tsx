import { useEffect, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { AssessmentPlatform } from '../assignments/platform.ts'
import { font, useColors } from '../assignments/theme.ts'
import { LoadMoreRow, MenuPill, Row, Section, Spinner, Unavailable, useModel, useRefresh, type PillOption } from '../assignments/ui.tsx'
import { participationLabel, placementLabel, yearLabel, type StatusFilter, type StudentRow } from './api.ts'
import type { StudentDirectoryModel } from './directory.ts'

/**
 * The Students tab root: the open year's records, searched and filtered on the server. It stays mounted under
 * pushed records, so its search, filter and scroll position survive a return. The shell loads it per context.
 */
export function StudentsScreen({ model, platform, onOpen }: { model: StudentDirectoryModel; platform: AssessmentPlatform; onOpen: (student: StudentRow) => void }) {
  useModel(model)
  const colors = useColors()
  const [text, setText] = useState(model.search)
  // A new academy starts with an empty query.
  useEffect(() => setText(model.search), [model, model.context])
  useEffect(() => {
    const timer = setTimeout(() => void model.setSearch(text), 300)
    return () => clearTimeout(timer)
  }, [model, text])

  const { state } = model
  const controls = state.status !== 'unsupported' && state.status !== 'noYear'
  return (
    <View style={styles.page}>
      {controls && (
        <View style={styles.controls}>
          <View style={[styles.search, { backgroundColor: colors.tertiaryFill }]}>
            <platform.Icon name="search-01" size={17} color={colors.secondaryLabel} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Search"
              placeholderTextColor={colors.secondaryLabel as string}
              accessibilityLabel="Search students"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              maxLength={100}
              style={[font.body, styles.input, { color: colors.label }]}
            />
          </View>
          <MenuPill platform={platform} label="Status" value={model.status} options={FILTERS} onSelect={(s) => void model.setStatus(s)} />
        </View>
      )}
      <Content model={model} platform={platform} onOpen={onOpen} />
    </View>
  )
}

function Content({ model, platform, onOpen }: { model: StudentDirectoryModel; platform: AssessmentPlatform; onOpen: (student: StudentRow) => void }) {
  const colors = useColors()
  const [refreshing, onRefresh] = useRefresh(() => model.refresh())
  const { state, students } = model
  if (state.status === 'idle' || state.status === 'loading') return <Spinner />
  if (state.status === 'unsupported') return <Unavailable platform={platform} title="Student records unavailable" message="This server doesn't support student records yet." icon="users" />
  if (state.status === 'noYear') {
    return <Unavailable platform={platform} title="No open academic year" icon="users" action="Retry" onAction={() => void model.refresh()} />
  }
  if (state.status === 'failed') return <Unavailable platform={platform} title="Couldn't load students" message={state.message} action="Retry" onAction={() => void model.refresh()} />
  if (students.length === 0) {
    return <Unavailable platform={platform} title={model.search ? 'No matching students' : EMPTY[model.status]} icon="users" />
  }
  // shortcut: not virtualized; pages are 50 rows behind "Load more". Use a FlatList if staff routinely load hundreds.
  return (
    <ScrollView
      style={{ backgroundColor: colors.groupedBackground }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {model.refreshError !== null && <Text style={[font.footnote, styles.notice, { color: colors.red }]}>{model.refreshError}</Text>}
      <Section header={model.year ? `${yearLabel(model.year)} · ${model.total} students` : undefined}>
        {students.map((s) => (
          <StudentRowView key={s.id} student={s} onPress={() => onOpen(s)} />
        ))}
        {model.hasMore && (
          <LoadMoreRow isLoading={model.isLoadingMore} failed={model.loadMoreError !== null} shown={students.length} total={model.total} onPress={() => void model.loadMore()} />
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

function StudentRowView({ student, onPress }: { student: StudentRow; onPress: () => void }) {
  const colors = useColors()
  const tags = [participationLabel(student.participationType), student.archived ? 'Archived' : null].filter((t) => t !== null)
  return (
    <Row onPress={onPress} style={styles.row} accessibilityLabel={[student.fullName, placementLabel(student), ...tags].join(', ')}>
      <Text style={[font.bodyMedium, { color: colors.label }]}>{student.fullName}</Text>
      <Text style={[font.subheadline, { color: colors.secondaryLabel }]}>{placementLabel(student)}</Text>
      <View style={styles.tags}>
        <Text style={[font.footnote, { color: colors.secondaryLabel }]}>{tags[0]}</Text>
        {student.archived && <Text style={[font.footnoteSemibold, { color: colors.orange }]}>Archived</Text>}
      </View>
    </Row>
  )
}

const FILTERS: readonly PillOption<StatusFilter>[] = [
  { value: 'active', title: 'Active' },
  { value: 'archived', title: 'Archived' },
  { value: 'all', title: 'All' },
]
const EMPTY: Record<StatusFilter, string> = { active: 'No active students', archived: 'No archived students', all: 'No students' }

const styles = StyleSheet.create({
  page: { flex: 1 },
  controls: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: 10 },
  input: { flex: 1, paddingVertical: 8 },
  content: { paddingTop: 8 },
  notice: { marginHorizontal: 32, marginBottom: 8 },
  row: { gap: 2, paddingVertical: 11 },
  tags: { flexDirection: 'row', columnGap: 8 },
})
