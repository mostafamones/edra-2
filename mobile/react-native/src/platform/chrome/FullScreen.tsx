import { useEffect, useRef, type ReactNode } from 'react'
import { Modal, Platform, StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useColors } from '../../features/sessions/screens/theme.ts'
import { SheetBarContext, SheetContext, type FeatureSheetProps } from './sheetTypes.ts'

export function useClosed({ visible, onDismiss, notifyOnClose }: FeatureSheetProps) {
  const previous = useRef(visible)
  useEffect(() => {
    const closed = previous.current && !visible
    previous.current = visible
    if (closed && notifyOnClose) onDismiss()
  }, [visible, notifyOnClose, onDismiss])
}

export function SheetContent({ children }: { children: ReactNode }) {
  return <SheetContext.Provider value={true}>{children}</SheetContext.Provider>
}

/** `pageSheet`: React Native's own iOS page sheet (swipe follows `dismissDisabled`) instead of a full-screen cover. */
export function FullScreen(props: FeatureSheetProps & { pageSheet?: boolean }) {
  const { visible, dismissDisabled, onDismiss, children, pageSheet } = props
  const colors = useColors()
  const requested = useRef(false)
  const nativeDismiss = Platform.OS === 'ios'
  useClosed({ ...props, notifyOnClose: !nativeDismiss && props.notifyOnClose, onDismiss: () => {
    if (!requested.current) onDismiss()
  } })
  useEffect(() => {
    if (visible) requested.current = false
  }, [visible])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={pageSheet ? 'pageSheet' : 'fullScreen'}
      // A blocked swipe also reports here; the guard below ignores it.
      allowSwipeDismissal={!!pageSheet && !dismissDisabled}
      onRequestClose={() => {
        if (visible && !dismissDisabled && !requested.current) {
          requested.current = true
          onDismiss()
        }
      }}
      onDismiss={() => {
        if (!visible && !requested.current && props.notifyOnClose) onDismiss()
      }}
    >
      {visible && (
        <SafeAreaProvider style={styles.fill}>
          <SheetContent>
            {/* A cover keeps its inline header even when presented from a page sheet. */}
            <SheetBarContext.Provider value={undefined}>
              <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: props.background ?? colors.background }]}>
                {children}
              </SafeAreaView>
            </SheetBarContext.Provider>
          </SheetContent>
        </SafeAreaProvider>
      )}
    </Modal>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
