@preconcurrency import AVFoundation
import ExpoModulesCore
import SwiftUI

/// React Native host for the Swift app's scanner preview (`CameraPreview` + `CameraControls` + pinch). Rear
/// camera, aspect fill. Runs while in a window; stops and turns the torch off when removed.
final class EdraCameraView: ExpoView {
    let onCodes = EventDispatcher()
    let onStatus = EventDispatcher()

    private let scanner = ScannerSession()
    private let preview = AVCaptureVideoPreviewLayer()
    private let camera: CameraController
    private let controls: UIHostingController<CameraControls>
    private var pinchBase: CGFloat?

    /// `CameraControls` height: 44pt buttons plus 12pt padding.
    private static let controlsHeight: CGFloat = 68

    required init(appContext: AppContext? = nil) {
        let camera = CameraController()
        self.camera = camera
        controls = UIHostingController(rootView: CameraControls(camera: camera))
        super.init(appContext: appContext)
        clipsToBounds = true
        preview.session = scanner.session
        preview.videoGravity = .resizeAspectFill
        layer.addSublayer(preview)
        controls.view.backgroundColor = .clear
        addSubview(controls.view)
        addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
        scanner.onCodes = { [weak self] in self?.onCodes(["codes": $0]) }
        scanner.onStatus = { [weak self] status in
            self?.camera.syncTorch()
            self?.onStatus(status)
        }
        scanner.onDevice = { [weak self] in self?.camera.attach($0) }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        preview.frame = bounds
        CATransaction.commit()
        let height = min(Self.controlsHeight, bounds.height)
        controls.view.frame = CGRect(x: 0, y: bounds.height - height, width: bounds.width, height: height)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            scanner.start()
        } else {
            scanner.stop()
            camera.detach()
        }
    }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        switch gesture.state {
        case .began, .changed:
            let base = pinchBase ?? camera.zoom
            pinchBase = base
            camera.setZoom(base * gesture.scale)
        default:
            pinchBase = nil
        }
    }
}

/// `CameraPreview.Coordinator` from the Swift app, plus interruption/error reporting and restart after stop.
/// Callbacks run on the main queue.
final class ScannerSession: NSObject, AVCaptureMetadataOutputObjectsDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    var onCodes: @MainActor ([String]) -> Void = { _ in }
    var onStatus: @MainActor ([String: Any]) -> Void = { _ in }
    var onDevice: @MainActor (AVCaptureDevice) -> Void = { _ in }

    private let queue = DispatchQueue(label: "edra.camera")
    /// Queue-confined.
    private var device: AVCaptureDevice?
    private var failed = false
    private var observers: [NSObjectProtocol] = []

    override init() {
        super.init()
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: .main) { [weak self] note in
                let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
                let reason = Self.reason(raw.flatMap(AVCaptureSession.InterruptionReason.init(rawValue:)))
                MainActor.assumeIsolated { self?.onStatus(["status": "interrupted", "reason": reason]) }
            },
            center.addObserver(forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.onStatus(["status": "resumed"]) }
            },
            center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: .main) { [weak self] note in
                let error = note.userInfo?[AVCaptureSessionErrorKey] as? AVError
                // Media services reset: Apple's guidance is to restart the session.
                if error?.code == .mediaServicesWereReset {
                    self?.start()
                    return
                }
                let message = error?.localizedDescription ?? ""
                MainActor.assumeIsolated { self?.onStatus(["status": "failed", "message": message]) }
            },
        ]
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    func start() {
        queue.async { [self] in
            if device == nil, !failed {
                guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                      let input = try? AVCaptureDeviceInput(device: device),
                      session.canAddInput(input) else { return fail("No rear camera") }
                session.addInput(input)
                let output = AVCaptureMetadataOutput()
                guard session.canAddOutput(output) else { return fail("Code scanning isn't supported") }
                session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                let wanted: [AVMetadataObject.ObjectType] = [
                    .qr, .code128, .code39, .code93, .ean13, .ean8, .upce, .pdf417, .dataMatrix, .interleaved2of5,
                ]
                output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
                self.device = device
            }
            guard let device, !session.isRunning else { return }
            session.startRunning()
            guard session.isRunning else { return } // an interruption notification explains why
            DispatchQueue.main.async {
                self.onDevice(device)
                self.onStatus(["status": "ready"])
            }
        }
    }

    func stop() {
        queue.async { [session] in if session.isRunning { session.stopRunning() } }
    }

    private func fail(_ message: String) {
        failed = true
        DispatchQueue.main.async { self.onStatus(["status": "failed", "message": message]) }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        let codes = objects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
        MainActor.assumeIsolated { onCodes(codes) }
    }

    private static func reason(_ reason: AVCaptureSession.InterruptionReason?) -> String {
        switch reason {
        case .videoDeviceNotAvailableInBackground: "background"
        case .videoDeviceInUseByAnotherClient, .audioDeviceInUseByAnotherClient: "inUse"
        case .videoDeviceNotAvailableWithMultipleForegroundApps: "multitasking"
        case .videoDeviceNotAvailableDueToSystemPressure: "pressure"
        default: "other"
        }
    }
}
