@preconcurrency import AVFoundation
import Observation

/// Torch and zoom for the scanner camera. Attached by `CameraPreview` once the device is open.
@MainActor
@Observable
final class CameraController {
    private(set) var hasTorch = false
    private(set) var torchOn = false
    private(set) var zoom: CGFloat = 1
    private(set) var maxZoom: CGFloat = 1

    private var device: AVCaptureDevice?

    /// Zoom beyond this is too soft to decode anyway.
    private static let zoomCeiling: CGFloat = 6

    func attach(_ device: AVCaptureDevice) {
        self.device = device
        hasTorch = device.hasTorch && device.isTorchAvailable
        maxZoom = min(device.maxAvailableVideoZoomFactor, Self.zoomCeiling)
        zoom = device.videoZoomFactor
        torchOn = false
        configure(device) {
            // Small printed codes: prefer close focus and keep refocusing.
            if $0.isAutoFocusRangeRestrictionSupported { $0.autoFocusRangeRestriction = .near }
            if $0.isFocusModeSupported(.continuousAutoFocus) { $0.focusMode = .continuousAutoFocus }
        }
    }

    func detach() {
        if let device, torchOn { configure(device) { $0.torchMode = .off } }
        device = nil
        torchOn = false
    }

    func toggleTorch() {
        guard let device, hasTorch else { return }
        let next = !torchOn
        configure(device) { $0.torchMode = next ? .on : .off }
        torchOn = device.torchMode == .on
    }

    func setZoom(_ factor: CGFloat) {
        guard let device else { return }
        let clamped = min(max(factor, 1), maxZoom)
        configure(device) { $0.videoZoomFactor = clamped }
        zoom = clamped
    }

    private func configure(_ device: AVCaptureDevice, _ change: (AVCaptureDevice) -> Void) {
        guard (try? device.lockForConfiguration()) != nil else { return }
        change(device)
        device.unlockForConfiguration()
    }
}
