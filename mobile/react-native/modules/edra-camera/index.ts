import { requireNativeView } from 'expo'
import type { ComponentType } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

/** `onStatus` payload. `reason`: background | inUse | multitasking | pressure | other. */
export type NativeCameraEvent = { status: 'ready' | 'resumed' | 'interrupted' | 'failed'; reason?: string; message?: string }

/**
 * iOS only: rear-camera AVFoundation preview (aspect fill) with the Swift app's torch/zoom controls and pinch.
 * `onCodes` fires with every code in each metadata frame, including an empty frame when codes leave view.
 */
export const EdraCameraView: ComponentType<{
  style?: StyleProp<ViewStyle>
  onCodes: (event: { nativeEvent: { codes: string[] } }) => void
  onStatus: (event: { nativeEvent: NativeCameraEvent }) => void
}> = requireNativeView('EdraCamera')
