import { useEffect } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { SessionDetailModel } from '../detail.ts'
import { correctionCount, officialLabel, shortDateTime } from './format.ts'
import { useModel } from './hooks.ts'
import { LabeledRow, Section, styles } from './parts.tsx'
import type { SessionsPlatform } from './platform.ts'
import { type, useColors } from './theme.ts'

/**
 * Reviews the draft values captured when the sheet opened and finalizes exactly that revision. A save that
 * lands meanwhile disables Finalize until staff review the latest values. The parent's `Sheet` must pass
 * `dismissDisabled={model.isPublishing}`.
 */
export function FinalizeReviewSheet({ onClose, platform, ...props }: { model: SessionDetailModel; onClose: () => void; platform: SessionsPlatform }) {
  const model = useModel(props.model)
  const colors = useColors()
  useEffect(() => {
    model.beginFinalizeReview()
    return () => model.endFinalizeReview()
  }, [model])

  const sheet = model.sheet
  const finalize = async () => {
    await model.publish()
    if (!model.publishCommand) onClose()
  }
  const trailing = model.finalizeReviewIsStale
    ? { title: 'Review latest', role: 'confirm' as const, onPress: () => model.beginFinalizeReview() }
    : {
        title: model.publishCommand ? 'Retry' : 'Finalize',
        role: 'confirm' as const,
        busy: model.isPublishing,
        disabled: !model.canPublish,
        onPress: () => void finalize(),
      }

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <platform.Header
        title={(sheet?.publication_count ?? 0) > 0 ? 'Finalize corrections' : 'Finalize attendance'}
        leading={{ title: 'Cancel', role: 'cancel', onPress: onClose, disabled: model.isPublishing }}
        trailing={trailing}
      />
      {sheet && (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 32 }}>
          <Section>
            <LabeledRow label="Official" value={officialLabel(model.official ?? 'notFinalized')} />
            {sheet.last_published_at ? <LabeledRow label="Last finalized" value={shortDateTime(sheet.last_published_at)} /> : null}
            {model.official === 'correctionsPending' ? <LabeledRow label="Corrections" value={String(correctionCount(sheet))} /> : null}
          </Section>
          <Section header="Draft">
            <LabeledRow label="Present" value={String(sheet.counts.present)} />
            <LabeledRow label="Late" value={String(sheet.counts.late)} />
            <LabeledRow label="Absent" value={String(sheet.counts.absent)} />
            <LabeledRow label="Excused" value={String(sheet.counts.excused)} />
            <LabeledRow label="Unknown" value={String(sheet.counts.unknown)} />
          </Section>
          {model.publishCommand && model.publishMessage ? (
            <Section>
              <Text accessibilityLiveRegion="polite" style={[type.body, styles.row, { color: colors.red }]}>{model.publishMessage}</Text>
            </Section>
          ) : null}
          {model.finalizeReviewIsStale ? (
            <Section>
              <Text accessibilityLiveRegion="polite" style={[type.body, styles.row, { color: colors.secondary }]}>
                Attendance changed while you were reviewing. The values above are the latest.
              </Text>
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}
