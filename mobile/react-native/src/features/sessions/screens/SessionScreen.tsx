import { useEffect, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ColorValue } from 'react-native'
import type { AddAttendeeModel } from '../attendees.ts'
import type { AttendanceEntry, AttendanceSheet, AttendanceStatus, LiveSession } from '../contract.ts'
import type { SessionDetailModel } from '../detail.ts'
import type { ScannerModel } from '../scanner.ts'
import { AddAttendeeScreen } from './AddAttendeeScreen.tsx'
import { FinalizeReviewSheet } from './FinalizeReviewSheet.tsx'
import { officialLabel, shortTime, statusLabel } from './format.ts'
import { useMessageDialog, useModel } from './hooks.ts'
import { LateDeadlineSheet } from './LateDeadlineSheet.tsx'
import { Banner, Button, describeStudent, Loading, StudentCard, Unavailable } from './parts.tsx'
import type { MenuItem, SessionsPlatform } from './platform.ts'
import { ScannerScreen } from './ScannerScreen.tsx'
import { useRefresh } from './SessionsHomeScreen.tsx'
import { type, useColors } from './theme.ts'

const STATUSES: AttendanceStatus[] = ['unknown', 'present', 'late', 'absent', 'excused']

type Presented =
  | { kind: 'finalize' }
  | { kind: 'late' }
  | { kind: 'attendee'; model: AddAttendeeModel }
  | { kind: 'scanner'; model: ScannerModel }
  | null

/**
 * One live session's attendance. The model is created once per presentation and auto-refreshes while the
 * route is focused. Pushed onto the Sessions stack; the stack header shows the title and Finalize button.
 */
export function SessionScreen({ session, makeModel, platform }: {
  session: LiveSession
  makeModel: (session: LiveSession) => SessionDetailModel
  platform: SessionsPlatform
}) {
  const [created] = useState(() => makeModel(session))
  const model = useModel(created)
  const colors = useColors()
  const focused = platform.useIsFocused()
  const bottom = platform.useBottomInset()
  const [presented, present] = useState<Presented>(null)
  const close = () => present(null)

  useEffect(() => (focused ? model.refreshWhileVisible() : undefined), [focused, model])

  // One alert at a time: status problems first, then notices, then finalize results (never over the review).
  useMessageDialog(
    platform,
    model.statusError,
    (message) => {
      const pending = model.uncertainStatus
      return {
        style: 'alert',
        title: "Couldn't change attendance",
        message,
        actions: pending
          ? [
              { title: 'Retry', onPress: () => void model.retryStatus(pending) },
              { title: 'Discard', role: 'destructive', onPress: () => model.discardStatus(pending) },
            ]
          : [{ title: 'OK', role: 'cancel' }],
      }
    },
    () => (model.statusError = null),
  )
  useMessageDialog(
    platform,
    model.notice,
    (message) => ({ style: 'alert', title: 'Attendance', message, actions: [{ title: 'OK', role: 'cancel' }] }),
    () => (model.notice = null),
    model.statusError === null,
  )
  useMessageDialog(
    platform,
    model.publishMessage,
    (message) => ({ style: 'alert', title: 'Attendance', message, actions: [{ title: 'OK' }] }),
    () => (model.publishMessage = null),
    model.statusError === null && model.notice === null && presented?.kind !== 'finalize',
  )

  const confirmMarkAbsent = () => {
    model.beginAbsenceReview()
    const retrying = model.absenceCommand !== null
    platform.present({
      style: 'actionSheet',
      title: retrying ? 'Retry marking the rest absent?' : `Mark ${model.unrecordedCount} absent?`,
      message: 'Nothing is official until you finalize attendance.',
      actions: [
        { title: retrying ? 'Retry' : `Mark ${model.unrecordedCount} absent`, role: 'destructive', onPress: () => void model.markRestAbsent() },
        ...(retrying ? [{ title: 'Discard', onPress: () => model.discardAbsenceCommand() }] : []),
      ],
    })
  }

  const menu: MenuItem[] = [
    { key: 'all', title: 'Show all', icon: 'hugeicons-users', checked: model.showAll, onPress: () => model.setShowAll(!model.showAll) },
    ...(model.sheet?.session.mandatory
      ? [{ key: 'absent', title: 'Mark rest absent', icon: 'hugeicons-user-x', destructive: true, disabled: !model.canMarkRestAbsent, onPress: confirmMarkAbsent }]
      : []),
    { key: 'add', title: 'Add attendee', icon: 'hugeicons-user-add-01', disabled: !model.canEdit, onPress: () => present({ kind: 'attendee', model: model.makeAttendees() }) },
    { key: 'divider', divider: true },
    { key: 'late', title: 'Set late deadline', icon: 'hugeicons-clock-01', onPress: () => present({ kind: 'late' }) },
    { key: 'scan', title: 'Open scanner', icon: 'hugeicons-scan', onPress: () => present({ kind: 'scanner', model: model.makeScanner() }) },
  ]

  let content
  const { state, sheet } = model
  if (state.kind === 'loading') content = <Loading label="Loading attendance…" />
  else if (state.kind === 'failed') content = <Unavailable title="Couldn't load attendance" message={state.message} action="Retry" onAction={() => void model.load()} />
  else if (sheet) content = <Loaded model={model} sheet={sheet} platform={platform} bottom={bottom} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <platform.Header
        title={model.session.schedule_title}
        trailing={{
          title: 'Finalize attendance',
          icon: 'hugeicons-tick-02',
          role: 'confirm',
          disabled: !model.canPublish,
          onPress: () => present({ kind: 'finalize' }),
        }}
      />
      {content}
      <platform.Menu items={menu} accessibilityLabel="Menu" style={[styles.fab, { bottom: 20 + bottom }]}>
        <platform.GlassButton icon="hugeicons-more-horizontal" accessibilityLabel="Menu" prominent diameter={56} />
      </platform.Menu>

      <platform.Sheet visible={presented?.kind === 'finalize'} onDismiss={close} dismissDisabled={model.isPublishing}>
        {presented?.kind === 'finalize' && <FinalizeReviewSheet model={model} onClose={close} platform={platform} />}
      </platform.Sheet>
      <platform.Sheet visible={presented?.kind === 'late'} onDismiss={close} detent="medium">
        {presented?.kind === 'late' && <LateDeadlineSheet initialMinutes={model.lateAfterMinutes} onSave={(m) => model.setLateAfter(m)} onClose={close} platform={platform} />}
      </platform.Sheet>
      <platform.Sheet visible={presented?.kind === 'attendee'} onDismiss={close}>
        {presented?.kind === 'attendee' && <AddAttendeeScreen model={presented.model} onClose={close} platform={platform} />}
      </platform.Sheet>
      <platform.Sheet visible={presented?.kind === 'scanner'} onDismiss={close} fullScreen>
        {presented?.kind === 'scanner' && (
          <ScannerScreen
            model={presented.model}
            academyName={model.session.academy_name}
            sessionTitle={model.session.schedule_title}
            makeAttendees={(code) => model.makeAttendees(code)}
            onClose={close}
            platform={platform}
          />
        )}
      </platform.Sheet>
    </View>
  )
}

function Loaded({ model, sheet, platform, bottom }: { model: SessionDetailModel; sheet: AttendanceSheet; platform: SessionsPlatform; bottom: number }) {
  const colors = useColors()
  const refresh = useRefresh(() => model.load())
  const entries = model.visibleEntries
  return (
    <View style={{ flex: 1 }}>
      {model.isArchived ? (
        <Banner
          title="Archived · not counted"
          message="A manager archived this session. Its attendance is kept for reference, is read-only and doesn't count."
        />
      ) : sheet.session.state !== 'live' ? (
        // e.g. a retried start whose original session has ended since.
        <Banner title="Ended" message="This session has ended, so check-ins are closed." />
      ) : null}
      {model.refreshProblem && (
        <Banner
          title="Couldn't refresh"
          message={model.refreshProblem}
          footnote={model.lastRefreshed ? `Last updated ${shortTime(model.lastRefreshed)}` : undefined}
          action={<Button title="Retry" onPress={() => void model.load()} />}
        />
      )}
      <Stats sheet={sheet} />
      <Text style={[type.footnote, styles.inset, { color: colors.secondary, marginTop: 8 }]}>Draft counts · {officialLabel(model.official ?? 'notFinalized')}</Text>
      <Text accessibilityRole="header" style={[type.title2, styles.inset, { color: colors.label, marginTop: 32, marginBottom: 12 }]}>
        {model.showAll ? 'All students' : 'Checked in students'}
      </Text>
      {entries.length === 0 ? (
        <View style={[styles.empty, { paddingBottom: 96 + bottom }]}>
          <Text style={[type.body, { color: colors.secondary }]}>{model.showAll ? 'No students on this roster' : 'No students checked in yet'}</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.annual_student_record_id}
          renderItem={({ item }) => <EntryRow model={model} entry={item} platform={platform} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          // Clear of the floating menu button.
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 + bottom }}
          refreshControl={<RefreshControl {...refresh} />}
        />
      )}
    </View>
  )
}

function EntryRow({ model, entry, platform }: { model: SessionDetailModel; entry: AttendanceEntry; platform: SessionsPlatform }) {
  const saving = model.savingEntries.has(entry.annual_student_record_id)
  return (
    <platform.Menu
      accessibilityLabel={describeStudent(entry, saving)}
      disabled={!model.canEdit || saving}
      items={STATUSES.map((status) => ({
        key: status,
        title: statusLabel(status),
        checked: entry.status === status,
        onPress: () => void model.changeStatus(status, entry),
      }))}
    >
      <StudentCard entry={entry} saving={saving} />
    </platform.Menu>
  )
}

/** Compact tiles: three fit the screen width, the rest scroll sideways with view-aligned snapping. */
function Stats({ sheet }: { sheet: AttendanceSheet }) {
  const colors = useColors()
  const width = (useWindowDimensions().width - 32 - 20) / 3
  const { counts } = sheet
  const tiles: [string, number, ColorValue?][] = [
    ['Students', counts.total],
    ['Present', counts.present, colors.green],
    ['Late', counts.late, colors.orange],
    ['Absent', counts.absent, colors.red],
    ['Excused', counts.excused, colors.cyan],
  ]
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + 10}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      style={{ marginTop: 24, flexGrow: 0 }}
    >
      {tiles.map(([label, count, dot]) => (
        <View key={label} style={[styles.tile, { width, backgroundColor: colors.tile }]} accessible accessibilityLabel={`${label}, ${count}`}>
          <View style={styles.tileLabel}>
            {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
            <Text numberOfLines={1} style={[type.footnote, { color: colors.secondary, flexShrink: 1 }]}>{label}</Text>
          </View>
          <Text style={[type.title, { color: colors.label }]}>{count}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20 },
  tile: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, gap: 4 },
  tileLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
