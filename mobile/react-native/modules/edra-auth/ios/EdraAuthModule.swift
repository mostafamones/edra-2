import ExpoModulesCore

/// React Native access to the app's single auth authority: the SwiftUI app's `SupabaseAuthService`
/// (same SDK, configuration and default Keychain storage) and its remembered academy preference.
public final class EdraAuthModule: Module {
    private static let configuration = AppConfiguration.load()
    /// One client per process, created on first use, like the SwiftUI app's `AuthModel`.
    private static let service = (try? configuration.get()).map { SupabaseAuthService(configuration: $0) }
    private static let selectionKey = "selectedAcademyID"

    public func definition() -> ModuleDefinition {
        Name("EdraAuth")

        Function("configuration") { () -> [String: Any] in
            switch Self.configuration {
            case .success(let config): ["apiOrigin": config.apiOrigin.absoluteString]
            case .failure(let error): ["issues": error.issues.map(\.message)]
            }
        }

        AsyncFunction("restoreSession") { () async throws in
            guard let service = Self.service else { throw Self.failure(AuthFailure.unavailable) }
            do { try await service.restoreSession() } catch { throw Self.failure(error) }
        }

        AsyncFunction("signIn") { (phone: String, password: String) async throws in
            guard let service = Self.service else { throw Self.failure(SignInFailure.other) }
            do { try await service.signIn(phone: phone, password: password) } catch { throw Self.failure(error) }
        }

        AsyncFunction("accessToken") { (forceRefresh: Bool) async throws -> String in
            guard let service = Self.service else { throw Self.failure(AuthFailure.unavailable) }
            do { return try await service.accessToken(forceRefresh: forceRefresh) } catch { throw Self.failure(error) }
        }

        AsyncFunction("signOut") { () async in
            await Self.service?.signOut()
        }

        Function("readSelection") { () -> String? in
            UserDefaults.standard.string(forKey: Self.selectionKey)
        }

        Function("writeSelection") { (academyId: String) in
            UserDefaults.standard.set(academyId, forKey: Self.selectionKey)
        }

        Function("clearSelection") {
            UserDefaults.standard.removeObject(forKey: Self.selectionKey)
        }
    }

    /// The failure case name (`signedOut`, `invalidCredentials`, ...) is the JS error `code`. Never the
    /// SDK error itself: its description can include server responses.
    private static func failure(_ error: some Error) -> Exception {
        let code = String(describing: error)
        return Exception(name: "EdraAuthFailure", description: code, code: code)
    }
}
