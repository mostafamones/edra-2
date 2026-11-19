import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui'
import { interactiveDismissDisabled, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers'
import { StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useColors } from '../../features/sessions/screens/theme.ts'
import { FullScreen, SheetContent } from './FullScreen.tsx'
import type { FeatureSheetProps } from './sheetTypes.ts'

function PageSheet({ visible, detent = 'large', children, onDismiss, dismissDisabled, notifyOnClose }: FeatureSheetProps) {
  const colors = useColors()
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
        ]}>
          <RNHostView>
            <View style={[styles.fill, { backgroundColor: colors.background }]}>
              <SafeAreaProvider>
                <SheetContent>{visible && children}</SheetContent>
              </SafeAreaProvider>
            </View>
          </RNHostView>
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
