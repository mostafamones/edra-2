import SwiftUI

/// Authenticated-root boundary. Sign-in and academy selection plug in here in later work.
struct RootView: View {
    let configuration: Result<AppConfiguration, AppConfiguration.LoadError>

    var body: some View {
        NavigationStack {
            switch configuration {
            case .success(let config):
                AuthenticatedRoot(config: config)
            case .failure(let error):
                NotConfiguredView(issues: error.issues)
            }
        }
    }
}

private struct AuthenticatedRoot: View {
    let config: AppConfiguration
    @State private var model: AuthModel

    init(config: AppConfiguration) {
        self.config = config
        _model = State(initialValue: AuthModel(service: SupabaseAuthService(configuration: config)))
    }

    var body: some View {
        Group {
            switch model.state {
            case .restoring:
                ProgressView("Loading…")
            case .signedOut, .signingIn:
                SignInView(model: model)
            case .authenticated:
                if let scope = model.scope {
                    // A new account scope gets fresh models; nothing carries over between accounts.
                    SignedInRoot(config: config, auth: model, scope: scope).id(ObjectIdentifier(scope))
                } else {
                    ProgressView("Signing out…")
                }
            }
        }
        .task { await model.restore() }
    }
}

private struct SignedInRoot: View {
    let auth: AuthModel
    let scope: AccountScope
    @State private var academies: AcademiesModel
    @State private var sessions: SessionsModel
    @State private var schedules: SchedulesModel
    @State private var start: StartSessionModel
    private let api: APIClient

    init(config: AppConfiguration, auth: AuthModel, scope: AccountScope) {
        self.auth = auth
        self.scope = scope
        let service = auth.service
        let api = APIClient(origin: config.apiOrigin) { try await service.accessToken(forceRefresh: $0) }
        self.api = api
        // Every callback is bound to this account: a late 401 from it can't sign out the next one.
        let signOut: @MainActor () async -> Void = { await auth.signOut(from: scope) }
        let academies = AcademiesModel(api: api, scope: scope, onUnauthenticated: signOut)
        let revalidate: @MainActor () async -> Void = { await academies.load() }
        let isCurrent: @MainActor (AcademyContext) -> Bool = { academies.isCurrent($0) }
        let sessions = SessionsModel(api: api, isCurrent: isCurrent, onUnauthenticated: signOut, onForbidden: revalidate)
        _academies = State(initialValue: academies)
        _sessions = State(initialValue: sessions)
        _schedules = State(initialValue: SchedulesModel(
            api: api, isCurrent: isCurrent, onUnauthenticated: signOut, onForbidden: revalidate
        ))
        _start = State(initialValue: StartSessionModel(
            api: api, isCurrent: isCurrent,
            onStarted: { await sessions.load(context: $0) },
            onUnauthenticated: signOut, onForbidden: revalidate
        ))
    }

    var body: some View {
        MainView(model: academies, sessions: sessions, schedules: schedules, start: start, makeSessionModel: { [academies, scope] session in
            SessionDetailModel(
                session: session,
                api: api,
                onUnauthenticated: { await auth.signOut(from: scope) },
                onForbidden: { await academies.load() }
            )
        }) { Task { await auth.signOut() } }
    }
}

private struct NotConfiguredView: View {
    let issues: [AppConfiguration.Issue]

    var body: some View {
        List {
            Section {
                Text("Copy Configuration/Development.xcconfig.example to Configuration/Local.xcconfig, fill it in, and rebuild.")
            } header: {
                Text("App is not configured")
            }
            Section("Problems") {
                ForEach(issues, id: \.self) { issue in
                    Text(issue.message)
                }
            }
        }
        .navigationTitle("Setup needed")
    }
}
