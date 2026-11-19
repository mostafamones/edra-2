/**
 * Platform-neutral camera state for both scanners (no React Native imports, so it runs under `node --test`).
 * Business rules (which code counts, pausing while a card or sheet is open, suppression) stay in
 * `ScannerModel` and `ScanFilter`; this only guarantees what they rely on: every report is the full set of
 * codes in view, and a code that leaves view is reported gone.
 */

/** A code missing from reports for this long has left the view. Covers frames where a held code is not decoded. */
export const HOLD_MS = 500

/** The Swift scanner's AVFoundation symbologies, named as expo-camera spells them (`itf14` is MLKit ITF on Android). */
export const BARCODE_TYPES = ['qr', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_e', 'pdf417', 'datamatrix', 'itf14'] as const

/**
 * Turns decoder reports into "every code currently in view". iOS reports complete frames (AVCaptureMetadataOutput);
 * expo-camera on Android reports one decoded code per event and never reports an empty frame, so codes there are
 * held until `HOLD_MS` passes without seeing them.
 */
export class CodePresence {
  private seenAt = new Map<string, number>()

  get visible(): string[] {
    return [...this.seenAt.keys()].sort()
  }

  /** `complete`: these are all the codes in this frame, so anything else left the view now. */
  seen(codes: readonly string[], now: number, complete: boolean): string[] {
    if (complete) for (const code of this.seenAt.keys()) if (!codes.includes(code)) this.seenAt.delete(code)
    for (const code of codes) this.seenAt.set(code, now)
    return this.visible
  }

  /** The codes still in view when some just left; null when nothing changed. */
  expire(now: number): string[] | null {
    let changed = false
    for (const [code, at] of this.seenAt) {
      if (now - at >= HOLD_MS) {
        this.seenAt.delete(code)
        changed = true
      }
    }
    return changed ? this.visible : null
  }

  /** When the next held code expires, or null when none are held. */
  nextExpiry(): number | null {
    let first: number | null = null
    for (const at of this.seenAt.values()) if (first === null || at < first) first = at
    return first === null ? null : first + HOLD_MS
  }

  /**
   * The camera resumed (foreground, interruption ended). While it was stopped nothing was seen, which is not the
   * same as the code leaving: like the Swift scanner, a code held through backgrounding stays handled until a
   * running camera actually loses it.
   */
  resume(now: number) {
    for (const code of this.seenAt.keys()) this.seenAt.set(code, now)
  }
}

/** Why the system stopped the capture session. `background` is ordinary app lifecycle and shows nothing. */
export type InterruptionReason = 'background' | 'inUse' | 'multitasking' | 'pressure' | 'other'

export type CameraStatus =
  | { kind: 'starting' }
  | { kind: 'running' }
  | { kind: 'interrupted'; reason: InterruptionReason }
  /** No usable rear camera or a session error. Sticky until the camera view is mounted again. */
  | { kind: 'failed'; message: string }

/** Native camera events: iOS `EdraCameraView.onStatus`, Android `onCameraReady` / `onMountError`. */
export type CameraEvent =
  | { status: 'ready' }
  | { status: 'resumed' }
  | { status: 'interrupted'; reason?: string }
  | { status: 'failed'; message?: string }

const reasons: readonly InterruptionReason[] = ['background', 'inUse', 'multitasking', 'pressure']

export function nextStatus(status: CameraStatus, event: CameraEvent): CameraStatus {
  if (status.kind === 'failed') return status
  switch (event.status) {
    case 'ready':
    case 'resumed':
      return { kind: 'running' }
    case 'interrupted':
      return { kind: 'interrupted', reason: reasons.find((r) => r === event.reason) ?? 'other' }
    case 'failed':
      return { kind: 'failed', message: event.message ?? '' }
  }
}

/** Short status shown over the preview when the camera can't scan, or null when nothing needs saying. */
export function statusNotice(status: CameraStatus): string | null {
  switch (status.kind) {
    case 'starting':
    case 'running':
      return null
    case 'failed':
      return 'Camera unavailable'
    case 'interrupted':
      switch (status.reason) {
        case 'background':
          return null
        case 'inUse':
          return 'Camera in use by another app'
        case 'multitasking':
          return "Camera isn't available while multitasking"
        default:
          return 'Camera paused'
      }
  }
}

/**
 * Torch for the expo-camera preview (iOS keeps it in the native `CameraController`). Matches the Swift controller:
 * off when the camera attaches, toggles only while available, and goes off whenever the camera stops so it never
 * comes back on by itself after backgrounding or an interruption.
 */
export type Torch = Readonly<{ available: boolean; on: boolean }>
export type TorchEvent = 'toggle' | 'running' | 'stopped' | 'failed'

export function nextTorch(torch: Torch, event: TorchEvent): Torch {
  switch (event) {
    case 'toggle':
      return torch.available ? { ...torch, on: !torch.on } : torch
    case 'running':
      return { ...torch, available: true }
    case 'stopped':
      return { ...torch, on: false }
    case 'failed':
      return { available: false, on: false }
  }
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined'

/**
 * `CameraPermission.request()`: asks only while undetermined, otherwise reports the stored decision. Android's
 * `canAskAgain` is ignored on purpose: after one refusal both platforms send staff to Settings.
 */
export async function resolveCameraAccess(
  get: () => Promise<{ status: PermissionStatus }>,
  request: () => Promise<{ status: PermissionStatus }>,
): Promise<'granted' | 'denied'> {
  const { status } = await get()
  if (status === 'granted') return 'granted'
  if (status === 'denied') return 'denied'
  return (await request()).status === 'granted' ? 'granted' : 'denied'
}

/**
 * Android pinch on expo-camera's 0…1 zoom (a linear fraction of the device's range, so no 1×/2×/4× factors).
 * shortcut: fixed sensitivity, not the Swift 6× ceiling; revisit with device evidence or if Expo exposes zoom factors.
 */
export function pinchZoom(base: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return base
  return Math.min(1, Math.max(0, base + (distance / startDistance - 1) / 2))
}
