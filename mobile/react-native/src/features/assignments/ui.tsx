// Small building blocks shared by the Assessments screens, matching the SwiftUI pieces they replace.
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import type { Observable } from './environment.ts'
import { systemConfirm, type AssessmentPlatform, type IconName } from './platform.ts'
import { displayScore } from './score.ts'
import { digits, font, useColors } from './theme.ts'

const unobserved = () => () => {}
const never = () => 0

/** Re-renders when the model (if any) commits a change; read its getters directly. */
export function useModel<T extends Observable | null>(model: T): T {
  useSyncExternalStore(model?.subscribe ?? unobserved, model?.getVersion ?? never)
  return model
}

/** SwiftUI `.refreshable`: the spinner stays while the reload runs. */
export function useRefresh(reload: () => Promise<void>): [boolean, () => void] {
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void reload().finally(() => setRefreshing(false))
  }, [reload])
  return [refreshing, onRefresh]
}

export function Spinner() {
  return (
    <View style={styles.fill}>
      <ActivityIndicator />
    </View>
  )
}

/** ContentUnavailableView: optional icon, title, message and a prominent action. */
export function Unavailable(props: { platform: AssessmentPlatform; title: string; icon?: IconName; message?: string; action?: string; onAction?: () => void }) {
  const colors = useColors()
  const { Icon } = props.platform
  return (
    <View style={[styles.fill, styles.unavailable]}>
      {props.icon && <Icon name={props.icon} size={44} color={colors.secondaryLabel} />}
      <Text style={[font.title2Bold, styles.center, { color: colors.label }]} accessibilityRole="header">
        {props.title}
      </Text>
      {props.message !== undefined && <Text style={[font.subheadline, styles.center, { color: colors.secondaryLabel }]}>{props.message}</Text>}
      {props.action !== undefined && props.onAction && <ProminentButton title={props.action} onPress={props.onAction} style={styles.unavailableAction} />}
    </View>
  )
}

/** `.borderedProminent` */
export function ProminentButton(props: { title: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const colors = useColors()
  return (
    <Pressable accessibilityRole="button" onPress={props.onPress} style={({ pressed }) => [styles.prominent, { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 }, props.style]}>
      <Text style={[font.bodySemibold, { color: colors.white }]}>{props.title}</Text>
    </Pressable>
  )
}

/** `.bordered`; `small` is `.controlSize(.small)`. */
export function BorderedButton(props: { title: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [props.small ? styles.borderedSmall : styles.bordered, { backgroundColor: colors.tertiaryFill, opacity: props.disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[props.small ? font.subheadline : font.bodyMedium, { color: colors.accentText }]}>{props.title}</Text>
    </Pressable>
  )
}

/** A borderless (accent text) button. */
export function TextButton(props: { title: string; onPress: () => void; disabled?: boolean; style?: TextStyle }) {
  const colors = useColors()
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!props.disabled }} disabled={props.disabled} onPress={props.onPress} hitSlop={8}>
      {({ pressed }) => <Text style={[font.body, props.style, { color: colors.accentText, opacity: props.disabled ? 0.4 : pressed ? 0.5 : 1 }]}>{props.title}</Text>}
    </Pressable>
  )
}

/** "8.5 / 10": the mark bold, the maximum muted. */
export function ScoreText(props: { total: string | null | undefined; max: string | null | undefined; style: TextStyle }) {
  const colors = useColors()
  return (
    <Text style={[props.style, digits, { color: colors.label }]}>
      <Text style={styles.bold}>{displayScore(props.total)}</Text>
      <Text style={{ color: colors.secondaryLabel }}>{` / ${displayScore(props.max)}`}</Text>
    </Text>
  )
}

export type PillOption<T extends string> = Readonly<{ value: T; title: string; disabled?: boolean }>

/** A compact selection pill: the current choice and a chevron; tapping opens a menu that ticks the current choice. */
export function MenuPill<T extends string>(props: { platform: AssessmentPlatform; label: string; value: T; options: readonly PillOption<T>[]; onSelect: (value: T) => void }) {
  const colors = useColors()
  const { platform, label, value, options, onSelect } = props
  const title = options.find((o) => o.value === value)?.title ?? ''
  const pill = (pressed = false) => (
    <View style={[styles.pill, { backgroundColor: colors.secondaryFill, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[font.subheadlineMedium, { color: colors.label }]}>{title}</Text>
      {/* No chevron-down asset is bundled; the right chevron turned down is the same glyph. */}
      <View style={styles.chevron}>
        <platform.Icon name="chevron-right" size={14} color={colors.secondaryLabel} />
      </View>
    </View>
  )
  if (platform.Menu) {
    const items = options.map((o) => ({ key: o.value, title: o.title, checked: o.value === value, disabled: o.disabled, onPress: () => onSelect(o.value) }))
    return (
      <platform.Menu items={items} accessibilityLabel={`${label}, ${title}`} style={styles.pillHost}>
        {pill()}
      </platform.Menu>
    )
  }
  const open = () =>
    (platform.confirm ?? systemConfirm)({
      title: label,
      actions: [...options.map((o) => ({ title: o.title, disabled: o.disabled, onPress: () => onSelect(o.value) })), { title: 'Cancel', role: 'cancel' as const }],
    })
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${title}`} onPress={open}>
      {({ pressed }) => pill(pressed)}
    </Pressable>
  )
}

/** `.insetGrouped` section: optional header above a rounded card of rows with inset separators. */
export function Section(props: { header?: string; children: ReactNode[] | ReactNode }) {
  const colors = useColors()
  const rows = (Array.isArray(props.children) ? props.children : [props.children]).filter((c) => c !== null && c !== undefined && c !== false)
  return (
    <View style={styles.section}>
      {props.header !== undefined && <Text style={[font.footnote, styles.sectionHeader, { color: colors.secondaryLabel }]}>{props.header}</Text>}
      <View style={[styles.card, { backgroundColor: colors.secondaryGroupedBackground }]}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
            {row}
          </View>
        ))}
      </View>
    </View>
  )
}

/** One List row: 44 pt minimum, 16 pt insets, highlight while pressed. */
export function Row(props: { onPress?: () => void; onLongPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; selected?: boolean }) {
  const colors = useColors()
  if (!props.onPress) return <View style={[styles.row, props.style]}>{props.children}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={props.selected === undefined ? undefined : { selected: props.selected }}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      accessibilityActions={props.onLongPress ? [{ name: 'longpress' }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && props.onLongPress?.()}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.tertiaryFill }, props.style]}
    >
      {props.children}
    </Pressable>
  )
}

/** The "Load more" row of a paged list: button or spinner, then "n of total". */
export function LoadMoreRow(props: { isLoading: boolean; failed: boolean; shown: number; total: number; onPress: () => void }) {
  const colors = useColors()
  return (
    <Row style={styles.loadMore}>
      {props.isLoading ? <ActivityIndicator /> : <TextButton title={props.failed ? 'Retry loading more' : 'Load more'} onPress={props.onPress} />}
      <Text style={[font.body, { color: colors.secondaryLabel }]}>{`${props.shown} of ${props.total}`}</Text>
    </Row>
  )
}

export const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  unavailable: { paddingHorizontal: 32, gap: 8 },
  unavailableAction: { marginTop: 8 },
  prominent: { minHeight: 34, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  bordered: { minHeight: 34, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  borderedSmall: { minHeight: 28, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingLeft: 14, paddingRight: 10, borderRadius: 999 },
  pillHost: { alignSelf: 'flex-start' },
  chevron: { transform: [{ rotate: '90deg' }] },
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: { paddingHorizontal: 16, paddingBottom: 6 },
  card: { borderRadius: 10, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' },
  loadMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
