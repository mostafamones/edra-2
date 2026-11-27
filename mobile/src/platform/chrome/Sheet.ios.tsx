import { BottomSheet, Button, Group, Host, NavigationStack, ProgressView, RNHostView, Toolbar, ToolbarItem } from '@expo/ui/swift-ui'
import {
  accessibilityLabel, disabled, interactiveDismissDisabled, navigationBarTitleDisplayMode, navigationTitle,
  presentationBackground, presentationDetents, presentationDragIndicator, searchable,
} from '@expo/ui/swift-ui/modifiers'
import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { BarItem, HeaderProps } from '../../features/sessions/screens/platform.ts'
import { useColors } from '../../features/sessions/screens/theme.ts'
import { useSearchText } from './Bars.ios.tsx'
import { FeatureIcon } from './FeatureIcon.tsx'
import { FullScreen, SheetContent } from './FullScreen.tsx'
import { SheetBarContext, type FeatureSheetProps } from './sheetTypes.ts'

function Action({ item }: { item: BarItem }) {
  if (item.busy) return <ProgressView modifiers={[accessibilityLabel('In progress')]} />
  if (item.icon) {
    return (
      <Button onPress={item.onPress} modifiers={[accessibilityLabel(item.title), disabled(!!item.disabled)]}>
        <RNHostView matchContents><FeatureIcon name={item.icon} size={20} /></RNHostView>
      </Button>
    )
  }
  return <Button label={item.title} onPress={item.onPress} modifiers={[disabled(!!item.disabled)]} />
}

/** The sheet's own SwiftUI navigation bar, as the Swift app's `NavigationStack` inside each sheet. */
function SheetBar({ bar, children }: { bar?: HeaderProps; children: ReactNode }) {
  const search = bar?.search
  const { query, onChange } = useSearchText(search?.value ?? '', search?.onChange)
  return (
    <NavigationStack>
      <Toolbar modifiers={[
        navigationTitle(bar?.title ?? ''),
        navigationBarTitleDisplayMode('inline'),
        // shortcut: SDK 58 `searchable` has no `displayMode: .always` or `.onSubmit(of: .search)`; screens debounce
        // the query instead. Add a registered custom modifier if device review needs either.
        ...(search ? [searchable(query, { placement: 'navigationBarDrawer', prompt: search.placeholder, onChange })] : []),
      ]}>
        <RNHostView><View style={styles.fill}>{children}</View></RNHostView>
        <Toolbar.Content>
          {bar?.leading && <ToolbarItem placement="cancellationAction"><Action item={bar.leading} /></ToolbarItem>}
          {bar?.trailing && <ToolbarItem placement="confirmationAction"><Action item={bar.trailing} /></ToolbarItem>}
        </Toolbar.Content>
      </Toolbar>
    </NavigationStack>
  )
}

function PageSheet({ visible, detent = 'large', children, onDismiss, dismissDisabled, notifyOnClose, background }: FeatureSheetProps) {
  const colors = useColors()
  const [bar, setBar] = useState<HeaderProps>()
  return (
    <Host style={styles.anchor}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={() => {}}
        onDismiss={() => {
          if (visible || notifyOnClose) onDismiss()
        }}
      >
        <Group modifiers={[
          presentationDetents([detent]),
          presentationDragIndicator(dismissDisabled ? 'hidden' : 'visible'),
          interactiveDismissDisabled(!!dismissDisabled),
          // One surface behind the bar, the body and the home-indicator inset, instead of the default sheet material around an opaque body.
          ...(background ? [presentationBackground(background)] : []),
        ]}>
          <SheetBar bar={bar}>
            <View style={[styles.fill, { backgroundColor: background ?? colors.background }]}>
              <SafeAreaProvider>
                <SheetBarContext.Provider value={setBar}>
                  <SheetContent>{visible && children}</SheetContent>
                </SheetBarContext.Provider>
              </SafeAreaProvider>
            </View>
          </SheetBar>
        </Group>
      </BottomSheet>
    </Host>
  )
}

export function FeatureSheet(props: FeatureSheetProps) {
  return props.fullScreen ? <FullScreen {...props} /> : <PageSheet {...props} />
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0 },
  fill: { flex: 1 },
})
