import { Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose'
import { useRef } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useColors } from '../../features/sessions/screens/theme.ts'
import { FullScreen, SheetContent, useClosed } from './FullScreen.tsx'
import type { FeatureSheetProps } from './sheetTypes.ts'

function PageSheet(props: FeatureSheetProps) {
  const { visible, detent, children, onDismiss, dismissDisabled } = props
  const { height } = useWindowDimensions()
  const colors = useColors()
  const requested = useRef(false)
  useClosed({ ...props, onDismiss: () => {
    if (!requested.current && props.notifyOnClose) onDismiss()
    requested.current = false
  }, notifyOnClose: true })
  if (!visible) return null

  return (
    <Host style={styles.anchor}>
      <ModalBottomSheet
        skipPartiallyExpanded
        containerColor={colors.background}
        sheetGesturesEnabled={!dismissDisabled}
        showDragHandle={!dismissDisabled}
        properties={{ shouldDismissOnBackPress: !dismissDisabled, shouldDismissOnClickOutside: !dismissDisabled }}
        onDismissRequest={() => {
          if (!dismissDisabled && !requested.current) {
            requested.current = true
            onDismiss()
          }
        }}
      >
        <RNHostView matchContents={{ vertical: true }}>
          <View style={{ height: height * (detent === 'medium' ? 0.45 : 0.87), width: '100%' }}>
            <SafeAreaProvider>
              <SheetContent>{children}</SheetContent>
            </SafeAreaProvider>
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  )
}

export function FeatureSheet(props: FeatureSheetProps) {
  return props.fullScreen ? <FullScreen {...props} /> : <PageSheet {...props} />
}

const styles = StyleSheet.create({ anchor: { position: 'absolute', width: 0, height: 0 } })
