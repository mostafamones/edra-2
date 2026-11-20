import { Camera } from 'expo-camera'
import type { AssessmentPlatform } from '../../features/assignments/platform.ts'
import type { ScannerModel } from '../../features/sessions/scanner.ts'
import { ScannerCamera, type ScannerCameraProps, type TorchIcon } from './ScannerCamera.tsx'
import { resolveCameraAccess } from './state.ts'

export { ScannerCamera, type ScannerCameraProps, type TorchIcon } from './ScannerCamera.tsx'
export * from './state.ts'

/** Both platforms: expo-camera's permission API (AVCaptureDevice on iOS), asking only while undetermined. */
export const requestCameraPermission = () =>
  resolveCameraAccess(
    () => Camera.getCameraPermissionsAsync(),
    () => Camera.requestCameraPermissionsAsync(),
  )

/** The camera pieces of `AssessmentPlatform`. The workspace's `ScanFilter` pauses and suppresses codes. */
export function assessmentCamera(torchIcon: TorchIcon): Pick<AssessmentPlatform, 'Camera' | 'requestCameraPermission'> {
  const AssessmentCamera: AssessmentPlatform['Camera'] = (props) => <ScannerCamera {...props} torchIcon={torchIcon} />
  return { Camera: AssessmentCamera, requestCameraPermission }
}

/**
 * Props for the attendance scanner's preview. `ScannerModel.recognized` takes every frame, including while a card
 * awaits a decision, so suppressed codes are released when they leave view. The screen shows `blockedReason`
 * instead of mounting the camera.
 */
export const sessionCameraProps = (scanner: Pick<ScannerModel, 'recognized'>): Pick<ScannerCameraProps, 'onCodes'> => ({
  onCodes: (codes) => scanner.recognized(codes),
})
