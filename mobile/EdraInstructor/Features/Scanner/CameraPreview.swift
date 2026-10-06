@preconcurrency import AVFoundation
import SwiftUI

/// Live camera preview that reports every code currently in view. The session keeps running
/// while a card awaits a decision; the model simply ignores new codes.
struct CameraPreview: UIViewRepresentable {
    let controller: CameraController
    let onCodes: ([String]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(controller: controller, onCodes: onCodes) }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.videoGravity = .resizeAspectFill
        context.coordinator.configure(view.previewLayer)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        context.coordinator.onCodes = onCodes
    }

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
        Task { @MainActor in coordinator.controller.detach() }
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate, @unchecked Sendable {
        let controller: CameraController
        var onCodes: ([String]) -> Void
        private let session = AVCaptureSession()
        private let queue = DispatchQueue(label: "edra.camera")

        init(controller: CameraController, onCodes: @escaping ([String]) -> Void) {
            self.controller = controller
            self.onCodes = onCodes
        }

        func configure(_ layer: AVCaptureVideoPreviewLayer) {
            layer.session = session
            queue.async { [session, self] in
                guard let device = AVCaptureDevice.default(for: .video),
                      let input = try? AVCaptureDeviceInput(device: device),
                      session.canAddInput(input) else { return }
                session.addInput(input)
                let output = AVCaptureMetadataOutput()
                guard session.canAddOutput(output) else { return }
                session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                let wanted: [AVMetadataObject.ObjectType] = [
                    .qr, .code128, .code39, .code93, .ean13, .ean8, .upce, .pdf417, .dataMatrix, .interleaved2of5,
                ]
                output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
                session.startRunning()
                Task { @MainActor in self.controller.attach(device) }
            }
        }

        func stop() {
            queue.async { [session] in if session.isRunning { session.stopRunning() } }
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject],
                            from connection: AVCaptureConnection) {
            let codes = objects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
            onCodes(codes)
        }
    }
}
