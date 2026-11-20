import { SegmentedControl } from '@expo/ui/community/segmented-control'
import { Button, Capsule, ContextMenu, Divider, Group, HStack, Host, Image, Label, Menu, RNHostView, Text, Toggle } from '@expo/ui/swift-ui'
import {
  accessibilityLabel, background, buttonBorderShape, buttonStyle, disabled, font, foregroundStyle, frame, glassEffect, lineLimit, menuIndicator, menuOrder,
  padding, resizable, rotationEffect, shapes, tint, truncationMode,
} from '@expo/ui/swift-ui/modifiers'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { StyleSheet, View, useColorScheme, useWindowDimensions } from 'react-native'
import type { SegmentedProps } from '../../features/assignments/platform.ts'
import type { GlassButtonProps, MenuItem, PillMenuProps } from '../../features/sessions/screens/platform.ts'
import { useBoldText } from './boldText.ts'
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

const styles = StyleSheet.create({ capsule: { borderRadius: 999 }, pill: { alignSelf: 'flex-start' } })

function menuActions(items: MenuItem[], bold: boolean) {
  return items.map((item) => {
    if ('divider' in item) return <Divider key={item.key} />
    // UIMenu draws the template asset beside the title, as the Swift app's `Label { } icon: { Image(asset) }` did.
    const content = item.icon ? <Label title={item.title} icon={<Image assetName={featureIconAsset(item.icon, bold)} />} /> : undefined
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
}

export function Popup({ items, disabled: unavailable, accessibilityLabel: label, longPress, style, children }: PopupProps) {
  const trigger = <RNHostView matchContents={{ vertical: true, horizontal: !longPress && !!style }}><View>{children}</View></RNHostView>
  const bold = useBoldText()
  const actions = menuActions(items, bold)
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

/**
 * The selection pill is a SwiftUI menu button whose label SwiftUI sizes itself, so a new title resizes the capsule
 * and the host follows it. iOS 26 draws the system's interactive glass button; earlier iOS a gray bordered capsule.
 */
export function Pill({ title, accessibilityLabel: label, items, icon }: PillMenuProps) {
  // Long names truncate inside the screen's content width instead of overflowing it.
  const maxWidth = useWindowDimensions().width - 40
  const bold = useBoldText()
  const glyph = (name: string, size: number) => <Image assetName={featureIconAsset(name, bold)} modifiers={[resizable(), frame({ width: size, height: size })]} />
  return (
    <Host matchContents style={styles.pill}>
      <Menu
        label={
          <HStack spacing={6} modifiers={[padding({ vertical: 5 }), foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            {icon !== undefined && glyph(icon, 18)}
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), lineLimit(1), truncationMode('tail')]}>{title}</Text>
            {/* No chevron-down asset is bundled; the right chevron turned down is the same Hugeicon stroke. */}
            <Group modifiers={[rotationEffect(90), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>{glyph('chevron-right', 12)}</Group>
          </HStack>
        }
        modifiers={[
          menuOrder('fixed'),
          menuIndicator('hidden'),
          buttonStyle(supportsGlass ? 'glass' : 'bordered'),
          buttonBorderShape('capsule'),
          ...(supportsGlass ? [] : [tint('#8E8E93')]),
          frame({ maxWidth, alignment: 'leading' }),
          accessibilityLabel(label),
        ]}
      >
        {menuActions(items, bold)}
      </Menu>
    </Host>
  )
}

export function Segmented({ values, selectedIndex, onChange, accessibilityLabel }: SegmentedProps) {
  return <SegmentedControl values={[...values]} selectedIndex={selectedIndex} accessibilityLabel={accessibilityLabel}
    onChange={({ nativeEvent }) => onChange(nativeEvent.selectedSegmentIndex)} />
}
