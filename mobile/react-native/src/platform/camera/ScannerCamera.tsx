import { CameraView, type BarcodeScanningResult } from 'expo-camera'
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { AppState, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native'
import { EdraCameraView, type NativeCameraEvent } from '../../../modules/edra-camera/index.ts'
import { BARCODE_TYPES, CodePresence, nextStatus, nextTorch, pinchZoom, statusNotice, type CameraEvent, type CameraStatus } from './state.ts'

export type ScannerCameraProps = Readonly<{
  /** Every code currently in view, on each decoded frame and when a code leaves view (empty array when none). */
  onCodes: (codes: string[]) => void
  /** Camera availability for screens that react to it; the preview already shows interruptions and failures. */
  onStatus?: (status: CameraStatus) => void
  style?: StyleProp<ViewStyle>
}>

/** Android torch glyph: the bundled Hugeicons `flash` / `flash-off` assets (stroke 1.5). iOS draws its own natively. */
export type TorchIcon = (on: boolean) => ReactNode

/**
 * Rear-camera code preview, aspect fill, with torch, zoom and pinch. iOS: the native `EdraCamera` module (the
 * Swift app's AVFoundation preview and Liquid Glass controls). Android: expo-camera with React Native controls.
 * Stops when unmounted.
 */
export function ScannerCamera({ onCodes, onStatus, style, torchIcon }: ScannerCameraProps & { torchIcon: TorchIcon }) {
  const [status, dispatch] = useReducer(nextStatus, { kind: 'starting' } as CameraStatus)
  const active = useAppActive()
  const running = active && status.kind === 'running'
  const report = usePresence(onCodes, running)
  const statusRef = useRef(onStatus)
  statusRef.current = onStatus
  useEffect(() => statusRef.current?.(status), [status])

  const notice = statusNotice(status)
  return (
    <View style={[styles.box, style]}>
      {Platform.OS === 'ios' ? (
        <EdraCameraView
          style={StyleSheet.absoluteFill}
          onCodes={(e: { nativeEvent: { codes: string[] } }) => report(e.nativeEvent.codes, true)}
          onStatus={(e: { nativeEvent: NativeCameraEvent }) => dispatch(e.nativeEvent as CameraEvent)}
        />
      ) : (
        <AndroidCamera running={running} failed={status.kind === 'failed'} dispatch={dispatch} report={report} torchIcon={torchIcon} />
      )}
      {notice !== null && (
        <View style={styles.notice} pointerEvents="none">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}
    </View>
  )
}

function AndroidCamera({
  running,
  failed,
  dispatch,
  report,
  torchIcon,
}: {
  running: boolean
  failed: boolean
  dispatch: (event: CameraEvent) => void
  report: (codes: string[], complete: boolean) => void
  torchIcon: TorchIcon
}) {
  const [torch, torchEvent] = useReducer(nextTorch, { available: false, on: false })
  const [zoom, setZoom] = useState(0)
  const pinch = useRef<{ base: number; distance: number } | null>(null)
  useEffect(() => torchEvent(failed ? 'failed' : running ? 'running' : 'stopped'), [running, failed])

  const onTouchMove = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches
    if (!b) return
    const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)
    pinch.current ??= { base: zoom, distance }
    setZoom(pinchZoom(pinch.current.base, pinch.current.distance, distance))
  }

  return (
    <View style={StyleSheet.absoluteFill} onTouchMove={onTouchMove} onTouchEnd={() => (pinch.current = null)}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch.on && running}
        zoom={zoom}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={running ? (r: BarcodeScanningResult) => report([r.data], false) : undefined}
        onCameraReady={() => dispatch({ status: 'ready' })}
        onMountError={(e: { message: string }) => dispatch({ status: 'failed', message: e.message })}
      />
      {torch.available && (
        <Pressable
          style={[styles.torch, torch.on && styles.torchOn]}
          onPress={() => torchEvent('toggle')}
          accessibilityRole="button"
          accessibilityLabel={torch.on ? 'Turn torch off' : 'Turn torch on'}
        >
          {torchIcon(torch.on)}
        </Pressable>
      )}
    </View>
  )
}

/** Feeds decoder reports through `CodePresence` and reports codes that leave view while the camera runs. */
function usePresence(onCodes: (codes: string[]) => void, running: boolean) {
  const presence = useRef(new CodePresence()).current
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(onCodes)
  latest.current = onCodes

  const schedule = () => {
    clearTimeout(timer.current)
    const at = presence.nextExpiry()
    if (at === null) return
    timer.current = setTimeout(() => {
      const visible = presence.expire(Date.now())
      if (visible) latest.current(visible)
      schedule()
    }, Math.max(0, at - Date.now()))
  }

  useEffect(() => {
    if (!running) return
    presence.resume(Date.now())
    schedule()
    return () => clearTimeout(timer.current)
  }, [running])

  return (codes: string[], complete: boolean) => {
    if (!running) return
    latest.current(presence.seen(codes, Date.now(), complete))
    schedule()
  }
}

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    return () => subscription.remove()
  }, [])
  return active
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: 'black' },
  notice: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
  noticeText: { color: 'white', fontSize: 17, textAlign: 'center' },
  torch: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  torchOn: { backgroundColor: 'rgba(255,214,10,0.35)' },
})
