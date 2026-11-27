import { Children, Fragment, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native'
import type { AttendanceEntry, LiveSession } from '../contract.ts'
import { sessionDetails, shortTime, statusLabel } from './format.ts'
import { statusTint, type, useColors } from './theme.ts'

/** iOS `ProgressView("…")` centered in the available space. */
export function Loading({ label }: { label?: string }) {
  const colors = useColors()
  return (
    <View style={styles.fill} accessible accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator />
      {label && <Text style={[type.body, { color: colors.secondary, marginTop: 8 }]}>{label}</Text>}
    </View>
  )
}

/** `ContentUnavailableView`: title, message and an optional prominent action. */
export function Unavailable({ title, message, action, onAction }: { title: string; message?: string; action?: string; onAction?: () => void }) {
  const colors = useColors()
  return (
    <View style={styles.unavailable}>
      <Text accessibilityRole="header" style={[type.title3, { color: colors.label, textAlign: 'center' }]}>{title}</Text>
      {message && <Text style={[type.subheadline, { color: colors.secondary, textAlign: 'center', marginTop: 8 }]}>{message}</Text>}
      {action && onAction && <Button title={action} prominent onPress={onAction} style={{ marginTop: 16 }} />}
    </View>
  )
}

/** `.bordered` / `.borderedProminent` capsule button. */
export function Button({
  title,
  onPress,
  prominent,
  disabled,
  busy,
  large,
  destructive,
  style,
  children,
  accessibilityHint,
}: {
  title: string
  onPress: () => void
  prominent?: boolean
  disabled?: boolean
  busy?: boolean
  /** `.controlSize(.large)` full-width row button. */
  large?: boolean
  destructive?: boolean
  style?: StyleProp<ViewStyle>
  children?: ReactNode
  accessibilityHint?: string
}) {
  const colors = useColors()
  const inactive = disabled || busy
  const tint = destructive ? colors.red : colors.accent
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title.replace(/^[✓✕]\s*/, '')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.large,
        { backgroundColor: prominent ? tint : colors.fill, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={prominent ? (colors.onAccent as string) : undefined} />
      ) : (
        children ?? <Text style={[type.headline, { color: prominent ? colors.onAccent : destructive ? colors.red : colors.accentText }]}>{title}</Text>
      )}
    </Pressable>
  )
}

/** Thin-material banner with a title and message (archived/ended/refresh problems). */
export function Banner({ title, message, footnote, action }: { title: string; message: string; footnote?: string; action?: ReactNode }) {
  const colors = useColors()
  return (
    <View style={[styles.banner, { backgroundColor: colors.material }]} accessible={!action}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.headline, { color: colors.label }]}>{title}</Text>
        <Text style={[type.subheadline, { color: colors.secondary }]}>{message}</Text>
        {footnote && <Text style={[type.footnote, { color: colors.secondary }]}>{footnote}</Text>}
      </View>
      {action}
    </View>
  )
}

/** `SessionCard`: accent edge, title, details and start/roster line, read as one element. */
export function SessionCard({ session, onPress }: { session: LiveSession; onPress: () => void }) {
  const colors = useColors()
  const details = sessionDetails(session)
  const started = `Started ${shortTime(session.started_at)}`
  const roster = `${session.roster_count} students`
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[session.schedule_title, details, started, roster].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.fill, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.edge, { backgroundColor: colors.accent }]} />
      <Text style={[type.headline, { color: colors.label }]}>{session.schedule_title}</Text>
      {!!details && <Text style={[type.subheadline, { color: colors.secondary }]}>{details}</Text>}
      <View style={styles.cardFooter}>
        <Text style={[type.footnote, { color: colors.secondary }]}>{started}</Text>
        <Text style={[type.footnote, { color: colors.secondary }]}>{roster}</Text>
      </View>
    </Pressable>
  )
}

/** What VoiceOver/TalkBack reads for a student card (also used by the status menu wrapping it). */
export function describeStudent(entry: AttendanceEntry, saving?: boolean) {
  const details = [entry.student_code, entry.origin === 'unexpected' ? 'Added' : null].filter(Boolean).join(' · ')
  const finalized = entry.correction_pending ? `Finalized: ${statusLabel(entry.published_status ?? 'unknown')}` : null
  const status = entry.status === 'unknown' ? 'Not recorded' : statusLabel(entry.status)
  return [entry.full_name, details, finalized, status, saving ? 'Saving' : null].filter(Boolean).join(', ')
}

/** `StudentCard`: name, code/added, finalized value when it differs, saving spinner and status capsule. */
export function StudentCard({ entry, saving }: { entry: AttendanceEntry; saving?: boolean }) {
  const colors = useColors()
  const tint = statusTint(entry.status, colors)
  const details = [entry.student_code, entry.origin === 'unexpected' ? 'Added' : null].filter(Boolean).join(' · ')
  const finalized = entry.correction_pending ? `Finalized: ${statusLabel(entry.published_status ?? 'unknown')}` : null
  return (
    <View style={[styles.student, { backgroundColor: colors.fill }]} accessible accessibilityLabel={describeStudent(entry, saving)}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: colors.label }]}>{entry.full_name}</Text>
        {!!details && <Text style={[type.subheadline, { color: colors.secondary }]}>{details}</Text>}
        {finalized && <Text style={[type.footnote, { color: colors.secondary }]}>{finalized}</Text>}
      </View>
      {saving && <ActivityIndicator />}
      <Badge text={statusLabel(entry.status)} tint={tint} />
    </View>
  )
}

/** Inset-grouped list section (`List { Section }`): optional header/footer, rows split by hairlines. */
export function Section({ header, footer, children }: { header?: string; footer?: string; children: ReactNode }) {
  const colors = useColors()
  const rows = Children.toArray(children)
  return (
    <View style={styles.section}>
      {header && (
        <Text accessibilityRole="header" style={[type.footnote, styles.sectionHeader, { color: colors.secondary }]}>
          {header.toUpperCase()}
        </Text>
      )}
      {rows.length > 0 && (
        <View style={[styles.group, { backgroundColor: colors.tile }]}>
          {rows.map((row, i) => (
            <Fragment key={i}>
              {i > 0 && <View style={[styles.hairline, { backgroundColor: colors.separator }]} />}
              {row}
            </Fragment>
          ))}
        </View>
      )}
      {footer && <Text style={[type.footnote, styles.sectionFooter, { color: colors.secondary }]}>{footer}</Text>}
    </View>
  )
}

/** `LabeledContent`: label leading, value trailing in secondary. */
export function LabeledRow({ label, value }: { label: string; value: string }) {
  const colors = useColors()
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[type.body, { color: colors.label, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: colors.secondary }]}>{value}</Text>
    </View>
  )
}

/** Capsule label on a 15% tint (status, "Live"). */
export function Badge({ text, tint }: { text: string; tint: ColorValue }) {
  return (
    <View style={styles.capsule}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.15 }]} />
      <Text style={[type.footnote, { fontWeight: '600', color: tint }]}>{text}</Text>
    </View>
  )
}

export const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  button: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  large: { flex: 1, minHeight: 52, borderRadius: 26 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 12, marginHorizontal: 16, marginTop: 16 },
  card: { padding: 16, paddingLeft: 19, gap: 6, borderRadius: 16, overflow: 'hidden' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  student: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  section: { marginHorizontal: 16, marginTop: 20 },
  sectionHeader: { paddingHorizontal: 16, paddingBottom: 6 },
  sectionFooter: { paddingHorizontal: 16, paddingTop: 6 },
  group: { borderRadius: 10, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, gap: 12 },
  capsule: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
})
