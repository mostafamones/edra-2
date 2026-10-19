import Observation

@MainActor
@Observable
final class AuthModel {
    enum State: Equatable {
        case restoring
        /// The stored session couldn't be checked right now (offline, auth service failing). The
        /// credentials are kept; nothing academy-scoped loads until a retry succeeds.
        case restoreFailed
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

    /// Bumped whenever an attempt starts or a sign-out happens, so a late restoration result
    /// can't authenticate (or sign out) after something newer has taken over.
    private var restoreAttempt = 0
    private var isRestoringNow = false

    func restore() async {
        guard state == .restoring, !isRestoringNow else { return }
        restoreAttempt += 1
        let attempt = restoreAttempt
        isRestoringNow = true
        defer { if attempt == restoreAttempt { isRestoringNow = false } }

        let failure: AuthFailure?
        do { try await service.restoreSession(); failure = nil } catch { failure = error }
        guard attempt == restoreAttempt, state == .restoring else { return }

        switch failure {
        case nil: authenticated()
        case .signedOut?:
            // Also clears a rejected session the SDK kept, so the next launch doesn't retry it.
            await service.signOut()
            guard attempt == restoreAttempt, state == .restoring else { return }
            state = .signedOut
        case .unavailable?: state = .restoreFailed
        // A cancelled task leaves the state for the next `restore()`; a refresh the SDK discarded
        // (not this task's cancellation) is offered as a retry rather than an endless spinner.
        case .cancelled?: if !Task.isCancelled { state = .restoreFailed }
        }
    }

    func retryRestore() async {
        guard state == .restoreFailed else { return }
        state = .restoring
        await restore()
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
        restoreAttempt += 1
        isRestoringNow = false
        await service.signOut()
        AcademiesModel.clearRememberedSelection()
        errorMessage = nil
        phoneError = nil
        state = .signedOut
    }
}
