import Foundation
import Supabase

enum SignInFailure: Error, Equatable {
    case invalidCredentials
    case network
    case other
}

/// Why a stored session couldn't be used. Only `.signedOut` means the credentials are gone or
/// definitively rejected; everything else keeps them for a later retry.
enum AuthFailure: Error, Equatable {
    /// No stored session, or the auth server definitively rejected it.
    case signedOut
    /// Network failure, timeout, rate limit, server error or an unclassified failure.
    case unavailable
    /// The work was cancelled, or its refresh was discarded because the stored session changed.
    case cancelled
}

/// The single authority over the instructor's session. Persistence is the Supabase SDK's Keychain storage.
protocol AuthService: Sendable {
    /// Returns once a valid (refreshed if needed) stored session exists.
    func restoreSession() async throws(AuthFailure)
    func signIn(phone: String, password: String) async throws(SignInFailure)
    /// Current access token; `forceRefresh` renews it first (used after a 401).
    func accessToken(forceRefresh: Bool) async throws(AuthFailure) -> String
    /// Always clears local credentials, even if the server call fails.
    func signOut() async
}

struct SupabaseAuthService: AuthService {
    private let client: SupabaseClient

    init(configuration: AppConfiguration) {
        client = SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabasePublishableKey,
            options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
        )
    }

    func restoreSession() async throws(AuthFailure) {
        // An expired access token alone is not terminal: `session` refreshes it first.
        do { _ = try await client.auth.session } catch { throw Self.classify(error) }
    }

    func signIn(phone: String, password: String) async throws(SignInFailure) {
        do {
            try await client.auth.signIn(phone: phone, password: password)
        } catch let error as AuthError {
            switch error.errorCode {
            case .invalidCredentials, .userNotFound: throw .invalidCredentials
            default: throw .other
            }
        } catch is URLError {
            throw .network
        } catch {
            throw .other
        }
    }

    func accessToken(forceRefresh: Bool) async throws(AuthFailure) -> String {
        do {
            if forceRefresh { return try await client.auth.refreshSession().accessToken }
            return try await client.auth.session.accessToken
        } catch {
            throw Self.classify(error)
        }
    }

    func signOut() async {
        try? await client.auth.signOut(scope: .local)
    }

    /// Codes the auth server uses for a session or user that can no longer be used.
    private static let rejectedCodes: Set<ErrorCode> = [
        .sessionNotFound, .sessionExpired, .refreshTokenNotFound, .refreshTokenAlreadyUsed,
        .userNotFound, .userBanned, .badJWT, .invalidJWT, .noAuthorization,
    ]

    /// Maps SDK errors by type and server response, never by message text.
    static func classify(_ error: any Error) -> AuthFailure {
        if error is CancellationError || Task.isCancelled { return .cancelled }
        if let error = error as? URLError { return error.code == .cancelled ? .cancelled : .unavailable }
        guard let error = error as? AuthError else { return .unavailable }
        switch error {
        // The SDK already cleared storage for the session-cleanup codes before throwing this.
        case .sessionMissing: return .signedOut
        case .refreshDiscarded: return .cancelled
        case .api(_, let code, _, let response):
            let status = response.statusCode
            if status == 429 || status >= 500 { return .unavailable }
            return (400..<500).contains(status) && rejectedCodes.contains(code) ? .signedOut : .unavailable
        default: return .unavailable
        }
    }
}
