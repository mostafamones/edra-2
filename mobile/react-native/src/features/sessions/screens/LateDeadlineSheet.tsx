import { useState } from 'react'
import { ScrollView, Text, TextInput, View } from 'react-native'
import { MAX_LATE_AFTER_MINUTES, parseLateAfter } from '../detail.ts'
import { Section, styles } from './parts.tsx'
import type { SessionsPlatform } from './platform.ts'
import { type, useColors } from './theme.ts'

/** Per-session Late-after minutes (medium detent). Mount inside a `Sheet` with `detent="medium"`. */
export function LateDeadlineSheet({ initialMinutes, onSave, onClose, platform }: {
  initialMinutes: number
  onSave: (minutes: number) => void
  onClose: () => void
  platform: SessionsPlatform
}) {
  const colors = useColors()
  const [text, setText] = useState(initialMinutes > 0 ? String(initialMinutes) : '')
  const minutes = parseLateAfter(text)
  const save = () => {
    if (minutes === null) return
    onSave(minutes)
    onClose()
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <platform.Header
        title="Late deadline"
        leading={{ title: 'Cancel', role: 'cancel', onPress: onClose }}
        trailing={{ title: 'Save', role: 'confirm', onPress: save, disabled: minutes === null }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <Section
          header="Late after"
          footer={`Students whose first check-in is more than this many minutes after the session started are marked Late. Leave empty or 0 to never mark Late. Maximum ${MAX_LATE_AFTER_MINUTES}.`}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={save}
            placeholder="Minutes"
            placeholderTextColor={colors.secondary as string}
            keyboardType="number-pad"
            returnKeyType="done"
            autoFocus
            accessibilityLabel="Late after, minutes"
            style={[type.body, styles.row, { color: colors.label }]}
          />
        </Section>
        {minutes === null && (
          <Text accessibilityLiveRegion="polite" style={[type.footnote, { color: colors.red, marginHorizontal: 32, marginTop: 8 }]}>
            Enter a whole number from 0 to {MAX_LATE_AFTER_MINUTES}.
          </Text>
        )}
      </ScrollView>
    </View>
  )
}
