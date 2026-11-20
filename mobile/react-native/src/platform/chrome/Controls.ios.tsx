import { SegmentedControl } from '@expo/ui/community/segmented-control'
import { Button, Capsule, ContextMenu, Divider, Group, Host, Image, Label, Menu, Rectangle, RNHostView, Toggle } from '@expo/ui/swift-ui'
import {
  accessibilityLabel, animation, Animation, background, buttonBorderShape, buttonStyle, disabled, foregroundStyle, frame, glassEffect, menuOrder,
  offset, shapes, tint,
} from '@expo/ui/swift-ui/modifiers'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
  AccessibilityInfo, Animated, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { type, useColors } from '../../features/sessions/screens/theme.ts'
import type { SegmentedProps } from '../../features/assignments/platform.ts'
import type { GlassButtonProps, MenuItem, PillMenuProps } from '../../features/sessions/screens/platform.ts'
import { useBoldText, useReduceMotion } from './boldText.ts'
import { FeatureIcon, featureIconAsset } from './FeatureIcon.tsx'
import type { CapsuleProps, PopupProps } from './controlsTypes.ts'
import { placeMenu, type Rect } from './menuPlacement.ts'

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
  hidden: { opacity: 0 },
  pillFace: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  pillText: { fontWeight: '600', flexShrink: 1 },
  down: { transform: [{ rotate: '90deg' }] },
  menu: { position: 'absolute', borderRadius: 20, overflow: 'hidden' },
  menuFace: { borderRadius: 20 },
  replica: { position: 'absolute' },
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
 * opens an anchored popup over it, so the popup covers the pill rather than sitting beside it. SwiftUI's menu flattened the label and dropped both glyphs on device.
 * On iOS 26 one SwiftUI glass shape grows from the pill into the popup and back, standing in for the system menu morph.
 */
export function Pill({ title, accessibilityLabel: label, items, icon }: PillMenuProps) {
  const reduceMotion = useReduceMotion()
  const trigger = useRef<ComponentRef<typeof View>>(null)
  const opened = useRef(0)
  const [menu, setMenu] = useState<{ id: number; anchor: Rect; covered: boolean; morph: boolean }>()
  const open = () => trigger.current?.measureInWindow((x, y, width, height) =>
    setMenu({ id: ++opened.current, anchor: { x, y, width, height }, covered: false, morph: supportsGlass && !reduceMotion }))
  // Late callbacks from an earlier popup carry its id, so they cannot hide or close a newer one.
  const settle = (id: number, covered?: true) =>
    setMenu((current) => current?.id !== id ? current : covered ? { ...current, covered } : undefined)
  const face = <PillFace icon={icon} title={title} />
  return (
    <>
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: !!menu }}
        hitSlop={4} onPress={open} style={({ pressed }) => [styles.pill, pressed && styles.pressed, menu?.covered && styles.hidden]}>
        <GlassCapsule style={styles.pillFace}>{face}</GlassCapsule>
      </Pressable>
      {menu && (
        <AnchoredMenu key={menu.id} anchor={menu.anchor} items={items} label={label}
          face={menu.morph ? face : undefined}
          onCover={() => settle(menu.id, true)} onClosed={(action) => {
            if (menu.id !== opened.current) return
            settle(menu.id)
            action?.()
          }} />
      )}
    </>
  )
}

function PillFace({ icon, title }: Pick<PillMenuProps, 'icon' | 'title'>) {
  const colors = useColors()
  return (
    <>
      {icon !== undefined && <FeatureIcon name={icon} size={18} />}
      <Text numberOfLines={1} style={[type.subheadline, styles.pillText, { color: colors.label }]}>{title}</Text>
      <View style={styles.down}><FeatureIcon name="chevron-right" size={12} color={colors.secondary} /></View>
    </>
  )
}

type AnchoredMenuProps = {
  anchor: Rect
  items: MenuItem[]
  label: string
  /** Present when the glass morphs: the popup redraws the pill here while the hidden trigger is covered. */
  face?: ReactNode
  onCover(): void
  onClosed(action?: () => void): void
}

function AnchoredMenu({ anchor, items, label, face, onCover, onClosed }: AnchoredMenuProps) {
  const morph = face !== undefined
  const colors = useColors()
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const selected = useRef<ComponentRef<typeof View>>(null)
  const [shown, setShown] = useState(false)
  const [rect, setRect] = useState<Rect>()
  const [closing, setClosing] = useState(false)
  const [visible, setVisible] = useState(true)
  const done = useRef(false)
  const pendingAction = useRef<() => void>(undefined)
  const progress = useRef(new Animated.Value(morph ? 0 : 1)).current
  const expanded = morph && shown && rect !== undefined && !closing
  const dismiss = (action?: () => void) => {
    if (done.current) return
    done.current = true
    pendingAction.current = action
    if (morph && shown) setClosing(true)
    else setVisible(false)
  }
  useEffect(() => {
    if (!morph || (!expanded && !closing)) return
    // The SwiftUI spring below runs on its own; this native-driven fade only swaps the pill and menu contents.
    Animated.timing(progress, { toValue: expanded ? 1 : 0, duration: MORPH_MS, useNativeDriver: true })
      .start(({ finished }) => { if (finished && closing) setVisible(false) })
    return () => progress.stopAnimation()
  }, [morph, expanded, closing, progress])
  // A rotation or resize moves the trigger, so the stored anchor is stale: close instead of pointing elsewhere.
  const size = useRef(window)
  useEffect(() => {
    if (size.current.width !== window.width || size.current.height !== window.height) dismiss()
  }, [window]) // Only a size change matters; dismiss is idempotent.
  const keyboard = Keyboard.isVisible() ? Keyboard.metrics() : undefined
  const floor = Math.min(window.height - insets.bottom, keyboard?.screenY ?? Infinity)
  const place = placeMenu(anchor, window, insets.top, floor)
  const glass = expanded ? rect : anchor
  return (
    <Modal transparent visible={visible} animationType={morph ? 'none' : 'fade'} onRequestClose={() => dismiss()}
      onDismiss={() => {
        const action = pendingAction.current
        pendingAction.current = undefined
        // Academy selection can present a confirmation alert. Wait until UIKit has dismissed this modal.
        onClosed(action)
      }}
      onShow={() => {
        setShown(true)
        if (morph) onCover()
        if (selected.current) AccessibilityInfo.sendAccessibilityEvent(selected.current, 'focus')
      }}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
      {morph && (
        <Host pointerEvents="none" ignoreSafeArea="all" style={StyleSheet.absoluteFill}>
          <Rectangle modifiers={[
            foregroundStyle('transparent'),
            frame({ width: glass.width, height: glass.height }),
            glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: expanded ? RADIUS : anchor.height / 2 }),
            offset({ x: glass.x, y: glass.y }),
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
            animation(Animation.snappy({ duration: MORPH_MS / 1000 }), expanded),
          ]} />
        </Host>
      )}
      {morph && (
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.pillFace, styles.replica, {
            left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height,
            opacity: progress.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' }),
          }]}>{face}</Animated.View>
      )}
      <Animated.View accessibilityViewIsModal accessibilityLabel={label} onAccessibilityEscape={() => dismiss()}
        onLayout={morph ? (event) => setRect(event.nativeEvent.layout) : undefined}
        style={[styles.menu, place,
          morph && { opacity: progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
        {!morph && (supportsGlass
          ? <GlassView glassEffectStyle="regular" style={[StyleSheet.absoluteFill, styles.menuFace]} />
          : <View style={[StyleSheet.absoluteFill, styles.menuFace, { backgroundColor: colors.tile, borderColor: colors.separator, borderWidth: StyleSheet.hairlineWidth }]} />)}
        <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.menuList}>
          {items.map((item) => {
            if ('divider' in item) return <View key={item.key} style={[styles.divider, { backgroundColor: colors.separator }]} />
            const tint = item.destructive ? colors.red : colors.label
            return (
              <Pressable key={item.key} ref={item.checked ? selected : undefined} accessibilityRole="menuitem"
                accessibilityLabel={item.title} accessibilityState={{ selected: !!item.checked, disabled: !!item.disabled }}
                disabled={item.disabled} onPress={() => dismiss(item.onPress)}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.fill }, item.disabled && styles.dimmed]}>
                {item.icon && <FeatureIcon name={item.icon} size={20} color={tint} />}
                <Text numberOfLines={2} style={[type.body, styles.itemText, { color: tint }]}>{item.title}</Text>
                {item.checked && <FeatureIcon name="tick-02" size={18} color={colors.label} />}
              </Pressable>
            )
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const MORPH_MS = 350
const RADIUS = 20

export function Segmented({ values, selectedIndex, onChange, accessibilityLabel }: SegmentedProps) {
  return <SegmentedControl values={[...values]} selectedIndex={selectedIndex} accessibilityLabel={accessibilityLabel}
    onChange={({ nativeEvent }) => onChange(nativeEvent.selectedSegmentIndex)} />
}
