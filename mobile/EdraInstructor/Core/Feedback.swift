import AudioToolbox
import UIKit

/// Haptics plus short system sounds. System sounds follow the ring/silent switch.
@MainActor
enum Feedback {
    case recognized, success, warning, failure

    func play() {
        switch self {
        case .recognized:
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            AudioServicesPlaySystemSound(1104)
        case .success:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            AudioServicesPlaySystemSound(1057)
        case .warning:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .failure:
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            AudioServicesPlaySystemSound(1053)
        }
    }
}
