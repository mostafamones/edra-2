import Foundation
import Supabase

enum SignInFailure: Error, Equatable {
    case invalidCredentials
    case network
    case other
}

/// The single authority over the instructor's session. Persistence is the Supabase SDK's Keychain storage.
protocol AuthService: Sendable {
    /// True when a valid (refreshed if needed) stored session exists.
    func restoreSession() async -> Bool
    func signIn(phone: String, password: String) async throws(SignInFailure)
    /// Current access token; `forceRefresh` renews it first (used after a 401).
    func accessToken(forceRefresh: Bool) async throws -> String
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

    func restoreSession() async -> Bool {
        (try? await client.auth.session) != nil
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

    func accessToken(forceRefresh: Bool) async throws -> String {
        if forceRefresh { return try await client.auth.refreshSession().accessToken }
        return try await client.auth.session.accessToken
    }

    func signOut() async {
        try? await client.auth.signOut(scope: .local)
    }
}
