import Observation

@MainActor
@Observable
final class AuthModel {
    enum State: Equatable {
        case restoring
        case signedOut
        case signingIn
        case authenticated
    }

    private(set) var state: State = .restoring
    private(set) var errorMessage: String?
    private(set) var phoneError: String?

    let service: AuthService

    init(service: AuthService) {
        self.service = service
    }

    func restore() async {
        guard state == .restoring else { return }
        state = await service.restoreSession() ? .authenticated : .signedOut
    }

    func signIn(phone: String, password: String) async {
        guard state == .signedOut else { return }
        errorMessage = nil
        phoneError = nil

        guard let normalized = PhoneNumber.normalizedEgyptian(phone) else {
            phoneError = phone.isEmpty ? "Enter your phone number." : "Enter a valid Egyptian mobile number."
            return
        }
        guard !password.isEmpty else {
            errorMessage = "Enter your password."
            return
        }

        state = .signingIn
        do {
            try await service.signIn(phone: normalized, password: password)
            state = .authenticated
        } catch {
            state = .signedOut
            errorMessage = switch error {
            case .invalidCredentials: "Wrong phone number or password."
            case .network: "Can't reach the server. Check your connection and try again."
            case .other: "Couldn't sign in. Please try again."
            }
        }
    }

    func signOut() async {
        await service.signOut()
        AcademiesModel.clearRememberedSelection()
        errorMessage = nil
        phoneError = nil
        state = .signedOut
    }
}
