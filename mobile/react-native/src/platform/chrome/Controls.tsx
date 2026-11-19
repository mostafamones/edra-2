import { HorizontalDivider, DropdownMenu, DropdownMenuItem, Host, RNHostView, SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose'
import { cloneElement, isValidElement, useState } from 'react'
import { semantics } from '@expo/ui/jetpack-compose/modifiers'
import { Pressable, StyleSheet, View } from 'react-native'
import type { SegmentedProps } from '../../features/assignments/platform.ts'
import type { GlassButtonProps } from '../../features/sessions/screens/platform.ts'
import { useColors } from '../../features/sessions/screens/theme.ts'
import { FeatureIcon } from './FeatureIcon.tsx'
import type { CapsuleProps, PopupProps } from './controlsTypes.ts'

export function GlassButton({ icon, accessibilityLabel, prominent, diameter, onPress }: GlassButtonProps) {
  const colors = useColors()
  const style = [styles.center, {
    width: diameter, height: diameter, borderRadius: diameter / 2,
    backgroundColor: prominent ? colors.accent : colors.fill,
  }]
  const glyph = <FeatureIcon name={icon} size={diameter / 2} color={prominent ? colors.onAccent : colors.label} />
  if (!onPress) return <View style={style}>{glyph}</View>
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
      android_ripple={{ color: colors.separator }} style={style}>
      {glyph}
    </Pressable>
  )
}

export function GlassCapsule({ children, style }: CapsuleProps) {
  const colors = useColors()
  return <View style={[{ backgroundColor: colors.fill, borderRadius: 999 }, style]}>{children}</View>
}

export function Popup({ items, accessibilityLabel, disabled, longPress, children, style }: PopupProps) {
  const [open, setOpen] = useState(false)
  const colors = useColors()
  const show = () => setOpen(true)
  const close = () => setOpen(false)
  const matchContents = { vertical: true, horizontal: !!style }
  // The assessment row supplies its tap handler. Give both gestures to one responder
  // so the nested row cannot consume the press before the context menu sees it.
  const row = longPress && isValidElement<{ onPress?: () => void }>(children) ? children : null
  const trigger = row?.props.onPress ? cloneElement(row, { onPress: undefined }) : children
  return (
    <Host matchContents={matchContents} style={style}>
      <DropdownMenu expanded={open && !disabled} onDismissRequest={close} color={colors.background}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents={matchContents}>
            <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
              accessibilityState={longPress ? undefined : { disabled, expanded: open && !disabled }}
              accessibilityActions={longPress ? [{ name: 'longpress' }] : undefined}
              onAccessibilityAction={longPress ? show : undefined}
              disabled={disabled} onPress={longPress ? row?.props.onPress : show} onLongPress={longPress ? show : undefined}>
              {trigger}
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {items.map((item) => {
            if ('divider' in item) return <HorizontalDivider key={item.key} />
            const color = item.destructive ? colors.red : colors.label
            return (
              <DropdownMenuItem key={item.key} enabled={!item.disabled} elementColors={{ textColor: color }}
                onClick={() => { close(); item.onPress() }}>
                <DropdownMenuItem.Text><Text>{item.title}</Text></DropdownMenuItem.Text>
                {item.icon && <DropdownMenuItem.LeadingIcon><RNHostView matchContents><FeatureIcon name={item.icon} size={18} color={color} /></RNHostView></DropdownMenuItem.LeadingIcon>}
                {item.checked && <DropdownMenuItem.TrailingIcon><RNHostView matchContents><FeatureIcon name="tick-02" size={18} /></RNHostView></DropdownMenuItem.TrailingIcon>}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  )
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } })

export function Segmented({ values, selectedIndex, onChange, accessibilityLabel }: SegmentedProps) {
  return (
    <Host matchContents={{ vertical: true }}>
      <SingleChoiceSegmentedButtonRow modifiers={[semantics({ contentDescription: accessibilityLabel })]}>
        {values.map((label, index) => (
          <SegmentedButton key={label} selected={index === selectedIndex} onClick={() => onChange(index)}>
            <SegmentedButton.Label><Text>{label}</Text></SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  )
}
