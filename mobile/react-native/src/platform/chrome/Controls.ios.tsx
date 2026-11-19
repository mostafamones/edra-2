import { SegmentedControl } from '@expo/ui/community/segmented-control'
import { Button, Capsule, ContextMenu, Divider, Group, Host, Image, Label, Menu, RNHostView, Toggle } from '@expo/ui/swift-ui'
import { accessibilityLabel, background, buttonBorderShape, buttonStyle, disabled, foregroundStyle, frame, glassEffect, menuOrder, shapes, tint } from '@expo/ui/swift-ui/modifiers'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { StyleSheet, View, useColorScheme } from 'react-native'
import type { SegmentedProps } from '../../features/assignments/platform.ts'
import type { GlassButtonProps } from '../../features/sessions/screens/platform.ts'
import { FeatureIcon, featureIconAsset } from './FeatureIcon.tsx'
import type { CapsuleProps, PopupProps } from './controlsTypes.ts'

const supportsGlass = isLiquidGlassAvailable()

export function GlassButton({ icon, accessibilityLabel: label, prominent, diameter, onPress }: GlassButtonProps) {
  const accent = useColorScheme() === 'dark' ? '#026630' : '#008236'
  const shape = { width: diameter, height: diameter }
  const glyph = (
    <RNHostView matchContents>
      <FeatureIcon name={icon} size={diameter / 2} color={prominent ? '#FFFFFF' : undefined} />
    </RNHostView>
  )
  if (!onPress) {
    return (
      <Host style={shape}>
        <Group modifiers={[
          frame(shape),
          supportsGlass
            ? glassEffect({ shape: 'circle', glass: { variant: 'regular', interactive: true, tint: prominent ? accent : undefined } })
            : background(prominent ? accent : { type: 'material', material: 'ultraThin' }, shapes.circle()),
        ]}>{glyph}</Group>
      </Host>
    )
  }
  return (
    <Host style={shape}>
      <Button onPress={onPress} modifiers={[
        buttonStyle(supportsGlass ? (prominent ? 'glassProminent' : 'glass') : (prominent ? 'borderedProminent' : 'bordered')),
        buttonBorderShape('circle'),
        tint(accent),
        accessibilityLabel(label),
      ]}>
        <Group modifiers={[frame({ width: diameter * 0.65, height: diameter * 0.65 })]}>{glyph}</Group>
      </Button>
    </Host>
  )
}

export function GlassCapsule({ interactive, children, style }: CapsuleProps) {
  if (supportsGlass) {
    return <GlassView isInteractive={interactive} glassEffectStyle="regular" style={[styles.capsule, style]}>{children}</GlassView>
  }
  return (
    <View style={style}>
      <Host pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Capsule modifiers={[foregroundStyle({ type: 'material', material: 'ultraThin' })]} />
      </Host>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({ capsule: { borderRadius: 999 } })

export function Popup({ items, disabled: unavailable, accessibilityLabel: label, longPress, style, children }: PopupProps) {
  const trigger = <RNHostView matchContents={{ vertical: true, horizontal: !longPress && !!style }}><View>{children}</View></RNHostView>
  const actions = items.map((item) => {
    if ('divider' in item) return <Divider key={item.key} />
    // UIMenu draws the template asset beside the title, as the Swift app's `Label { } icon: { Image(asset) }` did.
    const content = item.icon ? <Label title={item.title} icon={<Image assetName={featureIconAsset(item.icon)} />} /> : undefined
    if (item.checked !== undefined) {
      return (
        <Toggle key={item.key} label={content ? undefined : item.title} isOn={item.checked} onIsOnChange={item.onPress}
          modifiers={[disabled(!!item.disabled)]}>{content}</Toggle>
      )
    }
    return (
      <Button key={item.key} label={content ? undefined : item.title} role={item.destructive ? 'destructive' : 'default'}
        onPress={item.onPress} modifiers={[disabled(!!item.disabled)]}>{content}</Button>
    )
  })
  return (
    <Host matchContents={{ vertical: true, horizontal: !longPress && !!style }} style={style}>
      {longPress ? (
        <ContextMenu>
          <ContextMenu.Trigger>{trigger}</ContextMenu.Trigger>
          <ContextMenu.Items>{actions}</ContextMenu.Items>
        </ContextMenu>
      ) : (
        <Menu label={trigger} modifiers={[menuOrder('fixed'), disabled(!!unavailable), ...(label ? [accessibilityLabel(label)] : [])]}>
          {actions}
        </Menu>
      )}
    </Host>
  )
}

export function Segmented({ values, selectedIndex, onChange, accessibilityLabel }: SegmentedProps) {
  return <SegmentedControl values={[...values]} selectedIndex={selectedIndex} accessibilityLabel={accessibilityLabel}
    onChange={({ nativeEvent }) => onChange(nativeEvent.selectedSegmentIndex)} />
}
