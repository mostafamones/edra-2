import AVFoundation

enum CameraAccess {
    case granted
    case denied
}

enum CameraPermission {
    /// Asks the system for camera access the first time; afterwards reports the stored decision.
    static func request() async -> CameraAccess {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .granted
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video) ? .granted : .denied
        default: return .denied
        }
    }
}
