import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StartableSchedule } from '../contract.ts'
import { sameContext, type AcademyContext } from '../port.ts'
import type { SchedulesModel } from '../schedules.ts'
import type { StartSessionModel } from '../start.ts'
import { deviceTimeZone, groupSchedules, planLines, scheduleDetails } from './format.ts'
import { useDebounced, useModel } from './hooks.ts'
import { Badge, Section, Unavailable } from './parts.tsx'
import type { IconName, SessionsPlatform } from './platform.ts'
import { useRefresh } from './SessionsHomeScreen.tsx'
import { type, useColors } from './theme.ts'

export interface StartSessionProps {
  academy: { name: string; icon: IconName }
  context: AcademyContext
  schedules: SchedulesModel
  start: StartSessionModel
  platform: SessionsPlatform
}

/** The start picker presented over the shell while `start.isPickerPresented`. */
export function StartSessionSheet(props: StartSessionProps) {
  const start = useModel(props.start)
  return (
    <props.platform.Sheet visible={start.isPickerPresented} onDismiss={() => start.isPickerPresented && start.dismissPicker()}>
      <StartSessionScreen {...props} />
    </props.platform.Sheet>
  )
}

/** Picks a schedule of the selected academy and starts (or opens) its session. */
export function StartSessionScreen({ academy, context, platform, ...models }: StartSessionProps) {
  const schedules = useModel(models.schedules)
  const start = useModel(models.start)
  const colors = useColors()
  const [search, setSearch] = useState('')
  const load = () => schedules.load(context, search)
  // Debounce typing; the first page loads at once.
  useDebounced(search, search ? 300 : 0, () => void load())
  const refresh = useRefresh(load)
  const viewport = useRef(0)
  const loadMore = () => {
    if (schedules.hasMore && !schedules.loadMoreError) void schedules.loadMore()
  }

  const begin = (schedule: StartableSchedule) => void start.start(schedule, academy.name, context)
  const confirm = (schedule: StartableSchedule) =>
    platform.present({
      style: 'actionSheet',
      title: schedule.live_session_id === null ? `Start “${schedule.title}”?` : `“${schedule.title}” is live`,
      message:
        schedule.live_session_id === null
          ? `Starts a live session for ${academy.name} and captures its roster now. Planned times don't restrict starting.`
          : "Staff already started this session. You'll join the same live session.",
      actions: [{ title: schedule.live_session_id === null ? 'Start session' : 'Open live session', onPress: () => begin(schedule) }],
    })

  const notice = start.phase.kind === 'uncertain' || start.phase.kind === 'failed' ? start.phase.message : null
  // Retrying reuses the unacknowledged start's key, so it can't start twice.
  const attempt = start.attempt
  const retry =
    start.phase.kind === 'uncertain' && attempt && sameContext(attempt.context, context)
      ? schedules.schedules.find((s) => s.id === attempt.scheduleId)
      : undefined

  const state = schedules.state
  let body
  if (state.kind === 'failed') {
    body = <Unavailable title="Couldn't load schedules" message={state.message} action="Retry" onAction={load} />
  } else if (state.kind === 'loaded' && !schedules.hasOpenYear) {
    body = <Unavailable title="No open academic year" message="Sessions can only start in an open academic year." />
  } else if (state.kind === 'loaded' && !schedules.schedules.length) {
    body = search ? (
      <Unavailable title="No matching schedules" message={`No schedule title matches “${search}”.`} />
    ) : (
      <Unavailable title="No schedules" message="Schedules are created on the Edra website." />
    )
  } else if (state.kind === 'loaded' || (state.kind === 'loading' && schedules.schedules.length)) {
    // Rows prefetched before the picker opened stay visible while they refresh.
    const zone = schedules.timeZone
    body = (
      <>
        {groupSchedules(schedules.schedules).map((section) => (
          <Section key={section.title} header={section.title}>
            {section.data.map((s) => (
              <ScheduleRow key={s.id} schedule={s} onPress={() => confirm(s)} />
            ))}
          </Section>
        ))}
        <Section footer={zone && zone !== deviceTimeZone() ? `Times are in academy time (${zone}).` : undefined}>
          {schedules.isLoadingMore ? (
            <ActivityIndicator style={styles.pager} />
          ) : schedules.loadMoreError ? (
            <Pressable accessibilityRole="button" accessibilityHint={schedules.loadMoreError} onPress={() => void schedules.loadMore()} style={styles.row}>
              <Text style={[type.body, { color: colors.accentText }]}>Couldn't load more. Retry</Text>
            </Pressable>
          ) : null}
        </Section>
      </>
    )
  } else {
    body = <ActivityIndicator style={styles.pager} accessibilityLabel="Loading schedules…" />
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <platform.Header
        title="Start session"
        leading={{ title: 'Close', role: 'cancel', onPress: () => start.dismissPicker() }}
        search={{ value: search, onChange: setSearch, placeholder: 'Search schedules' }}
      />
      <ScrollView
        pointerEvents={start.isStarting ? 'none' : 'auto'}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...refresh} />}
        // Reaching the end of the list (or a first page shorter than the screen) loads the next page.
        onLayout={(e) => (viewport.current = e.nativeEvent.layout.height)}
        onScroll={({ nativeEvent: { layoutMeasurement, contentOffset, contentSize } }) => {
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) loadMore()
        }}
        onContentSizeChange={(_, height) => viewport.current > 0 && height <= viewport.current + 200 && loadMore()}
        scrollEventThrottle={100}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Section>
          <View style={styles.row} accessible accessibilityLabel={`Academy: ${academy.name}`}>
            <platform.Icon name={academy.icon} size={22} color={colors.accentText as string} />
            <Text style={[type.body, { color: colors.label, flex: 1 }]}>{academy.name}</Text>
          </View>
          {notice && <Text style={[type.subheadline, styles.row, { color: colors.red }]} accessibilityLiveRegion="polite">{notice}</Text>}
          {notice && retry && (
            <Pressable accessibilityRole="button" onPress={() => begin(retry)} style={styles.row}>
              <Text style={[type.body, { color: colors.accentText }]}>Retry starting “{retry.title}”</Text>
            </Pressable>
          )}
        </Section>
        {body}
      </ScrollView>
      {start.isStarting && (
        <View style={styles.overlay} pointerEvents="none" accessibilityLiveRegion="polite">
          <View style={[styles.starting, { backgroundColor: colors.material }]}>
            <ActivityIndicator />
            <Text style={[type.body, { color: colors.secondary }]}>Starting…</Text>
          </View>
        </View>
      )}
    </View>
  )
}

function ScheduleRow({ schedule, onPress }: { schedule: StartableSchedule; onPress: () => void }) {
  const colors = useColors()
  const details = scheduleDetails(schedule)
  const lines = planLines(schedule)
  const live = schedule.live_session_id !== null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[schedule.title, live ? 'Live' : null, details, ...lines, schedule.mandatory ? null : 'Optional'].filter(Boolean).join(', ')}
      accessibilityHint={live ? 'Opens the live session' : 'Starts a session'}
      accessibilityState={{ disabled: !schedule.can_start }}
      disabled={!schedule.can_start}
      onPress={onPress}
      style={({ pressed }) => [styles.scheduleRow, { opacity: !schedule.can_start ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <View style={styles.titleLine}>
        <Text style={[type.headline, { color: colors.label, flex: 1 }]}>{schedule.title}</Text>
        {live && <Badge text="Live" tint={colors.accentText} />}
      </View>
      {!!details && <Text style={[type.subheadline, { color: colors.secondary }]}>{details}</Text>}
      {lines.map((line, i) => (
        <Text key={i} style={[type.footnote, { color: colors.secondary }]}>{line}</Text>
      ))}
      {!schedule.mandatory && <Text style={[type.footnote, { color: colors.secondary }]}>Optional</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  scheduleRow: { gap: 4, paddingHorizontal: 16, paddingVertical: 11 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pager: { padding: 24 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  starting: { padding: 20, borderRadius: 16, alignItems: 'center', gap: 8 },
})
