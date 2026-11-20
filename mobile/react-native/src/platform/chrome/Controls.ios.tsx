import { SegmentedControl } from '@expo/ui/community/segmented-control'
import { Button, Capsule, ContextMenu, Divider, Group, Host, Image, Label, Menu, RNHostView, Toggle } from '@expo/ui/swift-ui'
import {
  accessibilityLabel, background, buttonBorderShape, buttonStyle, disabled, foregroundStyle, frame, glassEffect, menuOrder, shapes, tint,
} from '@expo/ui/swift-ui/modifiers'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import {
  AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { type, useColors } from '../../features/sessions/screens/theme.ts'
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

const styles = StyleSheet.create({
  capsule: { borderRadius: 999 },
  pill: { alignSelf: 'flex-start', maxWidth: '100%' },
  pressed: { opacity: 0.7 },
  pillFace: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  pillText: { fontWeight: '600', flexShrink: 1 },
  down: { transform: [{ rotate: '90deg' }] },
  menu: { position: 'absolute', borderRadius: 20, overflow: 'hidden' },
  menuFace: { borderRadius: 20 },
  scroll: { flexShrink: 1 },
  menuList: { paddingVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 16, paddingVertical: 8 },
  itemText: { flex: 1 },
  dimmed: { opacity: 0.4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
})

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
 * The selection pill draws its trigger in React Native (Hugeicons bitmaps beside the title) on genuine glass, and
 * opens an anchored popup below it. SwiftUI's menu flattened the label and dropped both glyphs on device.
 */
export function Pill({ title, accessibilityLabel: label, items, icon }: PillMenuProps) {
  const colors = useColors()
  const trigger = useRef<ComponentRef<typeof View>>(null)
  const [anchor, setAnchor] = useState<Anchor>()
  const open = () => trigger.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }))
  return (
    <>
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: !!anchor }}
        hitSlop={4} onPress={open} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <GlassCapsule style={styles.pillFace}>
          {icon !== undefined && <FeatureIcon name={icon} size={18} />}
          <Text numberOfLines={1} style={[type.subheadline, styles.pillText, { color: colors.label }]}>{title}</Text>
          <View style={styles.down}><FeatureIcon name="chevron-right" size={12} color={colors.secondary} /></View>
        </GlassCapsule>
      </Pressable>
      {anchor && <AnchoredMenu anchor={anchor} items={items} label={label} onClose={() => setAnchor(undefined)} />}
    </>
  )
}

type Anchor = { x: number; y: number; width: number; height: number }
type Action = Extract<MenuItem, { title: string }>

function AnchoredMenu({ anchor, items, label, onClose }: { anchor: Anchor; items: MenuItem[]; label: string; onClose(): void }) {
  const colors = useColors()
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const selected = useRef<ComponentRef<typeof View>>(null)
  // A rotation or resize moves the trigger, so the stored anchor is stale: close instead of pointing elsewhere.
  const size = useRef(window)
  useEffect(() => {
    if (size.current.width !== window.width || size.current.height !== window.height) onClose()
  }, [window, onClose])
  const below = window.height - insets.bottom - (anchor.y + anchor.height) - 2 * GAP
  const above = anchor.y - insets.top - 2 * GAP
  const down = below >= Math.min(above, 240)
  const width = Math.min(Math.max(anchor.width, 220), window.width - 2 * GAP)
  const left = Math.min(Math.max(anchor.x, GAP), window.width - GAP - width)
  const place = down ? { top: anchor.y + anchor.height + GAP } : { bottom: window.height - anchor.y + GAP }
  const choose = (item: Action) => { onClose(); item.onPress() }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}
      onShow={() => { if (selected.current) AccessibilityInfo.sendAccessibilityEvent(selected.current, 'focus') }}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal accessibilityLabel={label} onAccessibilityEscape={onClose}
        style={[styles.menu, place, { left, width, maxHeight: Math.max(down ? below : above, 120) }]}>
        {supportsGlass
          ? <GlassView glassEffectStyle="regular" style={[StyleSheet.absoluteFill, styles.menuFace]} />
          : <View style={[StyleSheet.absoluteFill, styles.menuFace, { backgroundColor: colors.tile, borderColor: colors.separator, borderWidth: StyleSheet.hairlineWidth }]} />}
        <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.menuList}>
          {items.map((item) => {
            if ('divider' in item) return <View key={item.key} style={[styles.divider, { backgroundColor: colors.separator }]} />
            const tint = item.destructive ? colors.red : colors.label
            return (
              <Pressable key={item.key} ref={item.checked ? selected : undefined} accessibilityRole="menuitem"
                accessibilityLabel={item.title} accessibilityState={{ selected: !!item.checked, disabled: !!item.disabled }}
                disabled={item.disabled} onPress={() => choose(item)}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.fill }, item.disabled && styles.dimmed]}>
                {item.icon && <FeatureIcon name={item.icon} size={20} color={tint} />}
                <Text numberOfLines={2} style={[type.body, styles.itemText, { color: tint }]}>{item.title}</Text>
                {item.checked && <FeatureIcon name="tick-02" size={18} color={colors.label} />}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

// Space between trigger and popup, and the popup's minimum margin from the screen edges.
const GAP = 8

export function Segmented({ values, selectedIndex, onChange, accessibilityLabel }: SegmentedProps) {
  return <SegmentedControl values={[...values]} selectedIndex={selectedIndex} accessibilityLabel={accessibilityLabel}
    onChange={({ nativeEvent }) => onChange(nativeEvent.selectedSegmentIndex)} />
}
