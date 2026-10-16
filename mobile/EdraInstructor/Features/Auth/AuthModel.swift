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
    /// The current account's scope while authenticated; ended before any sign-out clears state.
    private(set) var scope: AccountScope?

    let service: AuthService

    init(service: AuthService) {
        self.service = service
    }

    func restore() async {
        guard state == .restoring else { return }
        if await service.restoreSession() { authenticated() } else { state = .signedOut }
    }

    private func authenticated() {
        scope?.end()
        scope = AccountScope()
        state = .authenticated
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
            authenticated()
        } catch {
            state = .signedOut
            errorMessage = switch error {
            case .invalidCredentials: "Wrong phone number or password."
            case .network: "Can't reach the server. Check your connection and try again."
            case .other: "Couldn't sign in. Please try again."
            }
        }
    }

    /// Signs out only if `scope` is still the current account: a late 401 from an earlier account
    /// must not sign out the one now using the app.
    func signOut(from scope: AccountScope) async {
        guard scope.isActive, scope === self.scope else { return }
        await signOut()
    }

    func signOut() async {
        // Invalidate in-flight work first, so nothing it completes can touch the next account.
        scope?.end()
        scope = nil
        await service.signOut()
        AcademiesModel.clearRememberedSelection()
        errorMessage = nil
        phoneError = nil
        state = .signedOut
    }
}
