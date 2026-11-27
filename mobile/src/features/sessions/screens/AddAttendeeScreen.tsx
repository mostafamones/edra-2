import { useEffect } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { AddAttendeeModel } from '../attendees.ts'
import type { AttendeeCandidate } from '../contract.ts'
import { candidatePlacement } from './format.ts'
import { useDebounced, useModel } from './hooks.ts'
import { Button, Loading, Unavailable } from './parts.tsx'
import type { SessionsPlatform } from './platform.ts'
import { type, useColors } from './theme.ts'

/**
 * Search for a student not on the roster and add them explicitly. Nothing is written until Add. Closes
 * itself (then calls `onFinished`) once the server acknowledged the add.
 */
export function AddAttendeeScreen({ onClose, onFinished, platform, ...props }: {
  model: AddAttendeeModel
  onClose: () => void
  onFinished?: () => void
  platform: SessionsPlatform
}) {
  const model = useModel(props.model)
  const colors = useColors()
  // Debounced: a newer query cancels this wait, and only the newest search commits.
  useDebounced(model.query, 300, () => void model.search())
  useEffect(() => {
    if (!model.added) return
    onFinished?.()
    onClose()
  }, [model.added])

  const chosenId = model.chosen?.candidate.annual_student_record_id
  const { phase, items } = model
  let content
  if (phase.kind === 'idle' || (phase.kind === 'loading' && !items.length)) {
    content = <Loading />
  } else if (phase.kind === 'failed' && !items.length) {
    content = <Unavailable title="Couldn't search" message={phase.message} action="Retry" onAction={() => void model.search()} />
  } else if (!items.length) {
    content = (
      <View style={{ flex: 1 }}>
        <View style={{ alignItems: 'center', marginTop: 64 }}>
          <platform.Icon name="hugeicons-user-add-01" size={44} color={colors.secondary as string} />
        </View>
        <Unavailable title={model.query ? 'No student matches' : 'No students to add'} />
      </View>
    )
  } else {
    content = (
      <FlatList
        data={items}
        keyExtractor={(c) => c.annual_student_record_id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
        renderItem={({ item }) => (
          <CandidateRow
            candidate={item}
            chosen={item.annual_student_record_id === chosenId}
            disabled={model.isAdding}
            onPress={() => model.choose(item)}
            platform={platform}
          />
        )}
        ListFooterComponent={
          model.hasMore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: model.isLoadingMore }}
              disabled={model.isLoadingMore}
              onPress={() => void model.loadMore()}
              style={styles.row}
            >
              <Text style={[type.body, { color: model.isLoadingMore ? colors.secondary : colors.accentText }]}>
                {model.isLoadingMore ? 'Loading…' : 'Show more'}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
    )
  }

  const stale = model.choiceIsStale
  const bottom = platform.useBottomInset()
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <platform.Header
        title="Add attendee"
        leading={{ title: 'Close', role: 'cancel', onPress: onClose }}
        search={{
          value: model.query,
          onChange: (q) => model.setQuery(q),
          onSubmit: () => void model.search(),
          placeholder: 'Name or code',
          alwaysVisible: true,
        }}
      />
      <View style={{ flex: 1 }}>{content}</View>
      <View style={[styles.footer, { paddingBottom: 16 + bottom, borderColor: colors.separator, backgroundColor: colors.background }]}>
        {model.message ? (
          <Text accessibilityLiveRegion="polite" style={[type.footnote, { color: colors.red }]}>{model.message}</Text>
        ) : stale ? (
          <Text accessibilityLiveRegion="polite" style={[type.footnote, { color: colors.secondary }]}>Attendance changed after you chose this student.</Text>
        ) : null}
        {model.chosen && stale && !model.message ? (
          <Button title="I've reviewed the latest" onPress={() => model.chosen && model.choose(model.chosen.candidate)} />
        ) : (
          <Button
            title={model.chosen ? `Add ${model.chosen.candidate.full_name}` : 'Add'}
            prominent
            busy={model.isAdding}
            disabled={!model.chosen}
            onPress={() => void model.add()}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

function CandidateRow({ candidate, chosen, disabled, onPress, platform }: {
  candidate: AttendeeCandidate
  chosen: boolean
  disabled: boolean
  onPress: () => void
  platform: SessionsPlatform
}) {
  const colors = useColors()
  const placement = candidatePlacement(candidate)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[candidate.full_name, placement, candidate.student_code].filter(Boolean).join(', ')}
      accessibilityState={{ selected: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: colors.label }]}>{candidate.full_name}</Text>
        {!!placement && <Text style={[type.subheadline, { color: colors.secondary }]}>{placement}</Text>}
      </View>
      {candidate.student_code && (
        <Text style={[type.subheadline, { color: colors.secondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
          {candidate.student_code}
        </Text>
      )}
      {chosen && <platform.Icon name="hugeicons-tick-02" size={20} color={colors.accentText as string} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  footer: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
})
